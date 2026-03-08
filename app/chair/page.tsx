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

const COLORS = {
  text: "#111",
  muted: "#555",
  muted2: "#777",
  border: "#e9e9e9",
  borderStrong: "#e2e2e2",
  danger: "#b00020",
  dangerBorder: "#ffd6d6",
  warn: "#8a6d3b",
  white: "#fff",
  black: "#000",
  disabledText: "#7a7a7a",

  // subtle highlight for "Now Sharing"
  highlightBg: "#f6f6f6",
  highlightBorder: "#dcdcdc",
};

function baseButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    borderRadius: 12,
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    WebkitTextSizeAdjust: "100%",
    WebkitTapHighlightColor: "transparent",
  };
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

  const nextUpLabel = useMemo(() => queueDisplay[0]?.labelDisplay ?? null, [queueDisplay]);

  const controlsDisabled = busy || isEnded || isExpired;
  const nextDisabled = controlsDisabled || queueDisplay.length === 0;

  const hasActiveSharer = !!(nowSharingUid && nowSharingLabel && nowSharingLabel.trim().length > 0);

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
        color: COLORS.text,
        background: COLORS.white,
      }}
    >
      <h1 style={{ fontSize: 30, marginTop: 8 }}>Chair</h1>

      {!code ? (
        <>
          <p style={{ color: COLORS.muted, lineHeight: 1.4 }}>
            Start a meeting to generate a 4-digit code. Members enter it to join the line.
          </p>

          {error ? <div style={{ color: COLORS.danger, fontWeight: 700 }}>{error}</div> : null}

          <button
            onClick={onStart}
            disabled={busy}
            style={{
              ...baseButtonStyle(busy),
              padding: "16px 14px",
              borderRadius: 14,
              border: "none",
              background: busy ? "#222" : COLORS.black,
              color: COLORS.white,
              fontSize: 18,
              fontWeight: 900,
              boxShadow: busy ? "none" : "0 8px 18px rgba(0,0,0,0.12)",
            }}
          >
            {busy ? "Starting…" : "Start Meeting"}
          </button>
        </>
      ) : (
        <>
          <section
            style={{
              border: `2px solid ${COLORS.border}`,
              borderRadius: 16,
              padding: 16,
              background: COLORS.white,
            }}
          >
            <div style={{ color: COLORS.muted2, fontWeight: 800, letterSpacing: 0.5 }}>
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
                  color: isEnded ? COLORS.danger : COLORS.warn,
                }}
              >
                {isEnded ? "Meeting ended." : "Meeting expired."}
              </div>
            ) : null}

            {error ? (
              <div style={{ marginTop: 10, color: COLORS.danger, fontWeight: 800 }}>{error}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={onToggleLock}
                disabled={controlsDisabled}
                style={{
                  ...baseButtonStyle(controlsDisabled),
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: `2px solid ${COLORS.borderStrong}`,
                  background: meeting?.locked ? "#fff7df" : COLORS.white,
                  color: COLORS.text,
                  boxShadow: meeting?.locked ? "0 6px 14px rgba(0,0,0,0.08)" : "none",
                  filter: "none",
                }}
              >
                {meeting?.locked ? "Locked" : "Lock (optional)"}
              </button>

              <button
                onClick={onEnd}
                disabled={busy}
                style={{
                  ...baseButtonStyle(busy),
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: `2px solid ${COLORS.dangerBorder}`,
                  background: COLORS.white,
                  color: COLORS.danger,
                }}
              >
                End Meeting
              </button>
            </div>
          </section>

          {/* Now Sharing (subtle highlight only when actively sharing) */}
          <section
            style={{
              border: `2px solid ${hasActiveSharer ? COLORS.highlightBorder : COLORS.border}`,
              borderRadius: 16,
              padding: 14,
              background: hasActiveSharer ? COLORS.highlightBg : COLORS.white,
              boxShadow: hasActiveSharer ? "0 10px 20px rgba(0,0,0,0.06)" : "none",
              transition: "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
            }}
          >
            <div style={{ color: COLORS.muted2, fontWeight: 900 }}>NOW SHARING</div>

            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
              {nowSharingLabel ? nowSharingLabel : "—"}
            </div>

            <div style={{ color: COLORS.muted2, marginTop: 4, fontSize: 14 }}>
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
                  ...baseButtonStyle(nextDisabled),
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: nextDisabled ? `2px solid ${COLORS.borderStrong}` : "2px solid #111",
                  background: nextDisabled ? COLORS.white : COLORS.black,
                  color: nextDisabled ? COLORS.disabledText : COLORS.white,
                  boxShadow: nextDisabled ? "none" : "0 8px 18px rgba(0,0,0,0.12)",
                  minWidth: 110,
                  textAlign: "center",
                }}
              >
                {nextUpLabel ? `Next: ${nextUpLabel}` : "Next"}
              </button>
            </div>

            <div
              style={{
                border: `2px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: 12,
                marginTop: 10,
                background: COLORS.white,
              }}
            >
              {isEnded ? (
                <div style={{ color: COLORS.danger, fontWeight: 900 }}>This meeting has ended.</div>
              ) : isExpired ? (
                <div style={{ color: COLORS.warn, fontWeight: 900 }}>This meeting has expired.</div>
              ) : queueDisplay.length === 0 ? (
                <div style={{ color: COLORS.muted2 }}>No one in line yet.</div>
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

      <a href="/" style={{ display: "inline-block", marginTop: 6, color: COLORS.text }}>
        ← Back
      </a>
    </main>
  );
}