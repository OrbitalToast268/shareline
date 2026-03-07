import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export type MeetingDoc = {
  code: string;
  expiresAt: Timestamp;
  locked: boolean;
  ended: boolean;
  createdBy: string;
};

export type QueueEntry = {
  uid: string;
  label: string;
  joinedAt?: any;
};

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in. Try again.");
  return uid;
}

function random4DigitCode(): string {
  const n = Math.floor(Math.random() * 10000);
  return n.toString().padStart(4, "0");
}

export async function createMeeting(): Promise<string> {
  const createdBy = requireUid();

  for (let i = 0; i < 20; i++) {
    const code = random4DigitCode();
    const ref = doc(db, "meetings", code);

    const snap = await getDoc(ref);
    if (snap.exists()) continue;

    // 90 minutes from now
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 90 * 60 * 1000));

    const meeting: MeetingDoc = {
      code,
      expiresAt,
      locked: false,
      ended: false,
      createdBy,
    };

    await setDoc(ref, {
      ...meeting,
      createdAt: serverTimestamp(),
    });

    return code;
  }

  throw new Error("Could not generate a unique 4-digit code. Try again.");
}

export async function fetchMeeting(code: string): Promise<MeetingDoc | null> {
  const ref = doc(db, "meetings", code);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as MeetingDoc) : null;
}

export function subscribeMeeting(
  code: string,
  onChange: (m: MeetingDoc | null) => void
) {
  const ref = doc(db, "meetings", code);
  return onSnapshot(ref, (snap) => {
    onChange(snap.exists() ? (snap.data() as MeetingDoc) : null);
  });
}

export function subscribeQueue(
  code: string,
  onChange: (entries: QueueEntry[]) => void
) {
  const q = query(
    collection(db, "meetings", code, "queue"),
    orderBy("joinedAt", "asc")
  );

  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => d.data() as QueueEntry));
  });
}

export async function joinQueue(code: string, uid: string, label: string) {
  const ref = doc(db, "meetings", code, "queue", uid);
  await setDoc(ref, { uid, label, joinedAt: serverTimestamp() });
}

export async function leaveQueue(code: string, uid: string) {
  const ref = doc(db, "meetings", code, "queue", uid);
  await deleteDoc(ref);
}

/**
 * Removes the first person in line and returns who it was.
 * Chair uses this to show "Now sharing".
 */
export async function popNextSpeaker(code: string): Promise<QueueEntry | null> {
  const q = query(
    collection(db, "meetings", code, "queue"),
    orderBy("joinedAt", "asc"),
    limit(1)
  );
  const snap = await getDocs(q);
  const first = snap.docs[0];
  if (!first) return null;

  const data = first.data() as QueueEntry;
  await deleteDoc(first.ref);
  return data;
}

export async function setLocked(code: string, locked: boolean) {
  await updateDoc(doc(db, "meetings", code), { locked });
}

export async function endMeeting(code: string) {
  await updateDoc(doc(db, "meetings", code), { ended: true });
}

/**
 * Deletes ALL queue entries for a meeting.
 * This is "cleanup" and is called when the chair ends a meeting.
 */
export async function clearQueue(code: string) {
  const snap = await getDocs(collection(db, "meetings", code, "queue"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/**
 * End meeting + clear queue (best UX).
 */
export async function endMeetingAndClearQueue(code: string) {
  await endMeeting(code);
  await clearQueue(code);
}