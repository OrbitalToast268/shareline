"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureAnonUser } from "../lib/authClient";
import {
  createMeeting,
  endMeetingAndClearQueue,
  popNextSpeaker,
  setLocked,
  subscribeMeeting,
  subscribeQueue,
  type MeetingDoc,
  type QueueEntry,
} from "../lib/sharelineStore";

type QueueEntryDisplay = QueueEntry & { labelDisplay: string };

function disambiguateQueue(queue: QueueEntry[]): QueueEntryDisplay[] {
  const counts = new Map<string, number>();
  return queue.map((e) => {
    const base = (e.label ?? "").trim() || "Member";
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return { ...e, labelDisplay: n === 1 ? base : `${base} (${n})` };
  });
}

export default function ChairPage() {
  const [code, setCode] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingDoc | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const [nowSharingUid, setNowSharingUid] = useState<string | null>(null);
  const [nowSharingLabel, setNowSharingLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    const unsubM = subscribeMeeting(code, setMeeting);
    const unsubQ = subscribeQueue(code, setQueue);

    return () => {
      unsubM();
      unsubQ();
    };
  }, [code]);

  const queueDisplay = useMemo(() => disambiguateQueue(queue), [queue]);

  const expiresText = useMemo(() => {
    if (!meeting?.expiresAt) return null;
    return meeting.expiresAt.toDate().toLocaleTimeString();
  }, [meeting?.expiresAt]);

  const isExpired = useMemo(() => {
    if (!meeting?.expiresAt) return false;
    return meeting.expiresAt.toDate().getTime() < Date.now();
  }, [meeting?.expiresAt]);

  const isEnded = !!meeting?.ended;

  const nextUpLabel = useMemo(() => {
    return queueDisplay[0]?.labelDisplay ?? null;
  }, [queueDisplay]);

  const controlsDisabled = busy || isEnded || isExpired;
  const nextDisabled = controlsDisabled || queueDisplay.length === 0;

  const isActivelySharing = !!nowSharingUid && !!nowSharingLabel;

  async function onStart() {
    setError("");
    setBusy(true);
    try {
      await ensureAnonUser();
      const newCode = await createMeeting();
      setCode(newCode);

      setNowSharingUid(null);
      setNowSharingLabel(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not start meeting.");
    } finally {
      setBusy(false);
    }
  }

  async function onNext() {
    if (!code) return;
    setBusy(true);
    setError("");
    try {
      const popped = await popNextSpeaker(code);
      if (popped) {
        setNowSharingUid(popped.uid);
        setNowSharingLabel(popped.label);
      }
    } catch (e: any) {
      setError(e?.message ?? "Could not move to next.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleLock() {
    if (!code || !meeting) return;
    setBusy(true);
    setError("");
    try {
      await setLocked(code, !meeting.locked);
    } catch (e: any) {
      setError(e?.message ?? "Could not change lock.");
    } finally {
      setBusy(false);
    }
  }

  async function onEnd() {
    if (!code) return;
    setBusy(true);
    setError("");
    try {
      await endMeetingAndClearQueue(code);
      setNowSharingUid(null);
      setNowSharingLabel(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not end meeting.");
    } finally {
      setBusy(false);
    }
  }

  const cardBorder = "2px solid #eee";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        maxWidth: 520,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <h1 style={{ fontSize: 30, marginTop: 8 }}>Chair</h1>

      {!code ? (
        <>
          <p style={{ color: "#555", lineHeight: 1.4 }}>
            Start a meeting to generate a 4-digit code. Members enter it to join
            the line.
          </p>

          {error ? (
            <div style={{ color: "#b00020", fontWeight: 700 }}>{error}</div>
          ) : null}

          <button
            onClick={onStart}
            disabled={busy}
            style={{
              padding: "16px 14px",
              borderRadius: 14,
              border: "none",
              background: busy ? "#444" : "black",
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Starting…" : "Start Meeting"}
          </button>
        </>
      ) : (
        <>
          <section
            style={{
              border: cardBorder,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ color: "#777", fontWeight: 800, letterSpacing: 0.5 }}>
              TODAY’S SHARELINE CODE
            </div>

            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                letterSpacing: 6,
                marginTop: 10,
                lineHeight: 1,
              }}
            >
              {code}
            </div>

            <div style={{ marginTop: 10, color: "#666", fontSize: 14 }}>
              {expiresText ? <>Auto-expires around {expiresText}.</> : null}
            </div>

            {isExpired || isEnded ? (
              <div
                style={{
                  marginTop: 10,
                  fontWeight: 900,
                  color: isEnded ? "#b00020" : "#8a6d3b",
                }}
              >
                {isEnded ? "Meeting ended." : "Meeting expired."}
              </div>
            ) : null}

            {error ? (
              <div style={{ marginTop: 10, color: "#b00020", fontWeight: 800 }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={onToggleLock}
                disabled={controlsDisabled}
                style={{
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "2px solid #ddd",
                  background: meeting?.locked ? "#fff3cd" : "white",
                  fontWeight: 900,
                  cursor: controlsDisabled ? "not-allowed" : "pointer",
                  // avoid the "blurred out" look: keep opacity 1 and use color instead
                  opacity: 1,
                  color: controlsDisabled ? "#999" : "#111",
                }}
              >
                {meeting?.locked ? "Locked" : "Lock (optional)"}
              </button>

              <button
                onClick={onEnd}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "2px solid #ffdddd",
                  background: "white",
                  color: "#b00020",
                  fontWeight: 900,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                End Meeting
              </button>
            </div>
          </section>

          {/* NOW SHARING (subtle highlight when active) */}
          <section
            style={{
              border: isActivelySharing ? "2px solid #cfe3ff" : cardBorder,
              borderRadius: 16,
              padding: 14,
              background: isActivelySharing ? "#f5f9ff" : "white",
              boxShadow: isActivelySharing
                ? "0 0 0 3px rgba(207,227,255,0.45)"
                : "none",
            }}
          >
            <div style={{ color: "#777", fontWeight: 900 }}>NOW SHARING</div>

            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                marginTop: 6,
                color: isActivelySharing ? "#0b3d91" : "#111",
              }}
            >
              {nowSharingLabel ? nowSharingLabel : "—"}
            </div>

            <div style={{ color: "#777", marginTop: 4, fontSize: 14 }}>
              Tap “Next” when it’s time to move to the next share.
            </div>
          </section>

          <section style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 18, margin: 0, flex: 1 }}>Queue</h2>

              <button
                onClick={onNext}
                disabled={nextDisabled}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "none",
                  background: nextDisabled ? "#efefef" : "black",
                  color: nextDisabled ? "#888" : "white",
                  fontWeight: 900,
                  cursor: nextDisabled ? "not-allowed" : "pointer",
                  opacity: 1, // keep it looking like a button
                }}
              >
                {nextUpLabel ? `Next: ${nextUpLabel}` : "Next"}
              </button>
            </div>

            <div
              style={{
                border: cardBorder,
                borderRadius: 14,
                padding: 12,
                marginTop: 10,
              }}
            >
              {isEnded ? (
                <div style={{ color: "#b00020", fontWeight: 900 }}>
                  This meeting has ended.
                </div>
              ) : isExpired ? (
                <div style={{ color: "#8a6d3b", fontWeight: 900 }}>
                  This meeting has expired.
                </div>
              ) : queueDisplay.length === 0 ? (
                <div style={{ color: "#777" }}>No one in line yet.</div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {queueDisplay.map((e) => (
                    <li
                      key={e.uid}
                      style={{
                        padding: "8px 0",
                        fontWeight: 800,
                      }}
                    >
                      {e.labelDisplay}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}

      <a href="/" style={{ display: "inline-block", marginTop: 6 }}>
        ← Back
      </a>
    </main>
  );
}