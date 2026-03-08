// app/lib/sharelineStore.ts
"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type MeetingDoc = {
  code: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  ended: boolean;
  locked: boolean;
  endedAt?: Timestamp;
  endReason?: "manual" | "expired";
};

export type QueueEntry = {
  uid: string;
  label: string;
  joinedAt: Timestamp;
};

const MEETINGS = "meetings";
const QUEUE = "queue";

// Tune this however you want.
// (2h30m felt right from your earlier screenshots/logs.)
const DEFAULT_MEETING_MINUTES = 150;

// Guards so multiple tabs don’t spam cleanup loops.
const autoExpireInFlight = new Set<string>();

function nowMs() {
  return Date.now();
}

function isExpired(meeting?: MeetingDoc | null) {
  if (!meeting?.expiresAt) return false;
  return meeting.expiresAt.toMillis() <= nowMs();
}

function normalizeCode(code: string) {
  return code.trim();
}

function codeDocRef(code: string) {
  return doc(db, MEETINGS, normalizeCode(code));
}

function queueColRef(code: string) {
  return collection(db, MEETINGS, normalizeCode(code), QUEUE);
}

function random4Digit(): string {
  const n = Math.floor(Math.random() * 10000);
  return String(n).padStart(4, "0");
}

/**
 * Create a meeting with a unique 4-digit code (best effort).
 * Returns the code.
 */
export async function createMeeting(opts?: { minutes?: number }): Promise<string> {
  const minutes = Math.max(1, Math.floor(opts?.minutes ?? DEFAULT_MEETING_MINUTES));

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = random4Digit();
    const ref = codeDocRef(code);

    const didCreate = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);

      // If the code doesn't exist, we can create it.
      if (!snap.exists()) {
        const createdAt = Timestamp.now();
        const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + minutes * 60_000);

        const payload: Omit<MeetingDoc, "createdAt" | "expiresAt"> & {
          createdAt: any;
          expiresAt: any;
        } = {
          code,
          createdAt,
          expiresAt,
          ended: false,
          locked: false,
        };

        tx.set(ref, payload as any);
        return true;
      }

      // If it exists but is ended/expired, we can re-use it by overwriting.
      const existing = snap.data() as Partial<MeetingDoc>;
      const expired = existing.expiresAt ? existing.expiresAt.toMillis() <= nowMs() : false;
      const ended = !!existing.ended;

      if (ended || expired) {
        const createdAt = Timestamp.now();
        const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + minutes * 60_000);

        const payload: any = {
          code,
          createdAt,
          expiresAt,
          ended: false,
          locked: false,
          endedAt: null,
          endReason: null,
        };

        tx.set(ref, payload, { merge: false });
        return true;
      }

      return false;
    });

    if (didCreate) return code;
  }

  throw new Error("Could not allocate a unique meeting code. Try again.");
}

/**
 * Subscribe to meeting doc.
 * Includes auto-expire + cleanup: if meeting is expired and not ended,
 * we end it and clear the queue (idempotent).
 */
export function subscribeMeeting(code: string, onMeeting: (m: MeetingDoc | null) => void): Unsubscribe {
  const ref = codeDocRef(code);

  return onSnapshot(
    ref,
    async (snap) => {
      if (!snap.exists()) {
        onMeeting(null);
        return;
      }

      const meeting = snap.data() as MeetingDoc;
      onMeeting(meeting);

      // Auto-expire path (safe, idempotent, throttled)
      if (!meeting.ended && isExpired(meeting)) {
        const key = normalizeCode(code);
        if (autoExpireInFlight.has(key)) return;
        autoExpireInFlight.add(key);

        try {
          await endMeetingAndClearQueue(code, { reason: "expired" });
        } catch {
          // swallow: UI will still show expired; next snapshot may retry
        } finally {
          autoExpireInFlight.delete(key);
        }
      }
    },
    () => {
      // If subscribe errors, keep UI stable.
      onMeeting(null);
    }
  );
}

/**
 * Subscribe to the queue in join order.
 */
export function subscribeQueue(code: string, onQueue: (q: QueueEntry[]) => void): Unsubscribe {
  const qref = queueColRef(code);
  const qy = query(qref, orderBy("joinedAt", "asc"));

  return onSnapshot(
    qy,
    (snap) => {
      const out: QueueEntry[] = [];
      snap.forEach((d) => out.push(d.data() as QueueEntry));
      onQueue(out);
    },
    () => onQueue([])
  );
}

/**
 * Fetch meeting once.
 */
export async function fetchMeeting(code: string): Promise<MeetingDoc | null> {
  const snap = await getDoc(codeDocRef(code));
  return snap.exists() ? (snap.data() as MeetingDoc) : null;
}

/**
 * Add the current user to the queue (or update their label if already present).
 * Requires caller to pass uid (from auth).
 */
export async function joinQueue(code: string, uid: string, label: string): Promise<void> {
  const meetingRef = codeDocRef(code);
  const entryRef = doc(db, MEETINGS, normalizeCode(code), QUEUE, uid);

  await runTransaction(db, async (tx) => {
    const msnap = await tx.get(meetingRef);
    if (!msnap.exists()) throw new Error("That code wasn’t found.");

    const meeting = msnap.data() as MeetingDoc;

    if (meeting.ended) throw new Error("This meeting has ended.");
    if (isExpired(meeting)) throw new Error("This meeting has expired.");
    if (meeting.locked) throw new Error("This meeting is locked.");

    const cleanLabel = (label ?? "").trim();
    if (!cleanLabel) throw new Error("Please enter a name.");

    const esnap = await tx.get(entryRef);
    if (esnap.exists()) {
      tx.update(entryRef, { label: cleanLabel });
    } else {
      tx.set(entryRef, {
        uid,
        label: cleanLabel,
        joinedAt: Timestamp.now(),
      } as QueueEntry);
    }
  });
}

/**
 * Remove the current user from the queue.
 */
export async function leaveQueue(code: string, uid: string): Promise<void> {
  const entryRef = doc(db, MEETINGS, normalizeCode(code), QUEUE, uid);
  await deleteDoc(entryRef);
}

/**
 * Pop the next speaker from the queue (chair action).
 * Returns the popped entry or null.
 */
export async function popNextSpeaker(code: string): Promise<QueueEntry | null> {
  const meetingRef = codeDocRef(code);
  const qref = queueColRef(code);

  return await runTransaction(db, async (tx) => {
    const msnap = await tx.get(meetingRef);
    if (!msnap.exists()) throw new Error("Meeting not found.");

    const meeting = msnap.data() as MeetingDoc;

    if (meeting.ended) return null;
    if (isExpired(meeting)) throw new Error("Meeting expired.");

    const qSnap = await getDocs(query(qref, orderBy("joinedAt", "asc"), limit(1)));
    if (qSnap.empty) return null;

    const first = qSnap.docs[0];
    const entry = first.data() as QueueEntry;

    tx.delete(first.ref);
    return entry;
  });
}

/**
 * Lock/unlock meeting (chair action).
 */
export async function setLocked(code: string, locked: boolean): Promise<void> {
  const meetingRef = codeDocRef(code);

  await runTransaction(db, async (tx) => {
    const msnap = await tx.get(meetingRef);
    if (!msnap.exists()) throw new Error("Meeting not found.");

    const meeting = msnap.data() as MeetingDoc;

    if (meeting.ended) throw new Error("Meeting has ended.");
    if (isExpired(meeting)) throw new Error("Meeting has expired.");

    tx.update(meetingRef, { locked: !!locked });
  });
}

/**
 * End meeting + clear queue (chair action OR auto-expire).
 * This is idempotent.
 */
export async function endMeetingAndClearQueue(
  code: string,
  opts?: { reason?: "manual" | "expired" }
): Promise<void> {
  const reason = opts?.reason ?? "manual";
  const meetingRef = codeDocRef(code);

  // First: atomically mark ended if not already.
  const shouldClear = await runTransaction(db, async (tx) => {
    const msnap = await tx.get(meetingRef);
    if (!msnap.exists()) return false;

    const meeting = msnap.data() as MeetingDoc;

    if (meeting.ended) return false;

    tx.update(meetingRef, {
      ended: true,
      endedAt: Timestamp.now(),
      endReason: reason,
      locked: true, // optional: lock when ended to stop joins immediately
    });

    return true;
  });

  // Second: clear queue docs (safe to do even if meeting already ended)
  // If we just ended it OR it was already ended, we still want queue cleared per your preference.
  await clearQueue(code);

  // If meeting didn’t exist, still fine—no-op.
  void shouldClear;
}

/**
 * Clear all queue entries for a meeting (batched).
 */
async function clearQueue(code: string): Promise<void> {
  const qref = queueColRef(code);
  const snap = await getDocs(qref);

  if (snap.empty) return;

  // Batch delete in chunks (Firestore batch limit is 500).
  let batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    count++;

    if (count >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}