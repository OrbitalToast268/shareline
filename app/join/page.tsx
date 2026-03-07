"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureAnonUser } from "../lib/authClient";
import {
  fetchMeeting,
  joinQueue,
  leaveQueue,
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

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [joinedCode, setJoinedCode] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingDoc | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [label, setLabel] = useState(""); // no default name
  const [uid, setUid] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isValidCode = /^\d{4}$/.test(code);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await ensureAnonUser();
        if (!cancelled) setUid(user.uid);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not initialize sign-in.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!joinedCode) return;
    if (!uid) return;

    const unsubM = subscribeMeeting(joinedCode, setMeeting);
    const unsubQ = subscribeQueue(joinedCode, setQueue);

    return () => {
      unsubM();
      unsubQ();
    };
  }, [joinedCode, uid]);

  const isExpired = useMemo(() => {
    if (!meeting?.expiresAt) return false;
    return meeting.expiresAt.toDate().getTime() < Date.now();
  }, [meeting?.expiresAt]);

  const isEnded = !!meeting?.ended;
  const isLocked = !!meeting?.locked;

  const queueDisplay = useMemo(() => disambiguateQueue(queue), [queue]);

  const myPosition = useMemo(() => {
    if (!uid) return null;
    const idx = queueDisplay.findIndex((q) => q.uid === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [queueDisplay, uid]);

  const amInLine = myPosition !== null;
  const labelOk = label.trim().length > 0;

  function onChangeCode(v: string) {
    const digitsOnly = v.replace(/\D/g, "").slice(0, 4);
    setCode(digitsOnly);
  }

  async function onJoinMeeting() {
    setError("");
    setBusy(true);
    try {
      const user = await ensureAnonUser();
      setUid(user.uid);

      const m = await fetchMeeting(code);
      if (!m) {
        setError("That code wasn’t found.");
        return;
      }
      if (m.ended) {
        setError("That meeting has ended.");
        return;
      }
      if (m.expiresAt.toDate().getTime() < Date.now()) {
        setError("That code has expired.");
        return;
      }

      setJoinedCode(code);
      setMeeting(m);
    } catch (e: any) {
      setError(e?.message ?? "Could not join meeting.");
    } finally {
      setBusy(false);
    }
  }

  async function onGetInLine() {
    if (!joinedCode) return;

    setBusy(true);
    setError("");
    try {
      const user = await ensureAnonUser();
      setUid(user.uid);

      if (isEnded) {
        setError("That meeting has ended.");
        return;
      }
      if (isExpired) {
        setError("That code has expired.");
        return;
      }
      if (isLocked) {
        setError("The chair locked the line.");
        return;
      }

      const clean = label.trim();
      if (!clean) {
        setError("Please enter a name, initials, or a nickname.");
        return;
      }

      await joinQueue(joinedCode, user.uid, clean);
    } catch (e: any) {
      setError(e?.message ?? "Could not get in line.");
    } finally {
      setBusy(false);
    }
  }

  async function onStepOut() {
    if (!joinedCode) return;

    setBusy(true);
    setError("");
    try {
      const user = await ensureAnonUser();
      setUid(user.uid);

      await leaveQueue(joinedCode, user.uid);
    } catch (e: any) {
      setError(e?.message ?? "Could not step out.");
    } finally {
      setBusy(false);
    }
  }

  const statusMessage = useMemo(() => {
    if (!meeting) return null;
    if (isEnded) return { text: "Meeting ended.", color: "#b00020" };
    if (isExpired) return { text: "This meeting expired.", color: "#8a6d3b" };
    if (isLocked) return { text: "The chair locked the line.", color: "#8a6d3b" };
    return null;
  }, [meeting, isEnded, isExpired, isLocked]);

  const getInLineLabel = amInLine ? `You're in line (#${myPosition})` : "Get in line";

  const disableGetInLine =
    busy || !uid || isEnded || isExpired || isLocked || amInLine || !labelOk;

  const disableStepOut = busy || !uid || isEnded || isExpired || !amInLine;

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
      <h1 style={{ fontSize: 30, marginTop: 8 }}>Enter Code</h1>

      {!joinedCode ? (
        <>
          <p style={{ color: "#555", lineHeight: 1.4 }}>
            Type the 4-digit code the chair announces.
          </p>

          <input
            inputMode="numeric"
            placeholder="1234"
            value={code}
            onChange={(e) => onChangeCode(e.target.value)}
            style={{
              fontSize: 32,
              letterSpacing: 8,
              padding: "14px 16px",
              borderRadius: 14,
              border: "2px solid #ddd",
              outline: "none",
              textAlign: "center",
              fontWeight: 900,
            }}
          />

          {error ? (
            <div style={{ color: "#b00020", fontWeight: 800 }}>{error}</div>
          ) : null}

          <button
            onClick={onJoinMeeting}
            disabled={!isValidCode || busy}
            style={{
              padding: "16px 14px",
              borderRadius: 14,
              border: "none",
              background: !isValidCode || busy ? "#ddd" : "black",
              color: !isValidCode || busy ? "#666" : "white",
              fontSize: 18,
              fontWeight: 900,
              cursor: !isValidCode || busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Joining…" : "Join Meeting"}
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              border: "2px solid #eee",
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div style={{ color: "#777", fontWeight: 800 }}>MEETING CODE</div>
            <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 6 }}>
              {joinedCode}
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter your name, initials, or nickname"
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "2px solid #ddd",
                  outline: "none",
                  fontWeight: 800,
                }}
              />
            </div>

            {statusMessage ? (
              <div style={{ marginTop: 10, color: statusMessage.color, fontWeight: 900 }}>
                {statusMessage.text}
              </div>
            ) : null}

            {error ? (
              <div style={{ marginTop: 10, color: "#b00020", fontWeight: 800 }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={onGetInLine}
                disabled={disableGetInLine}
                style={{
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "none",
                  background: disableGetInLine ? "#ddd" : "black",
                  color: disableGetInLine ? "#666" : "white",
                  fontWeight: 900,
                  cursor: disableGetInLine ? "not-allowed" : "pointer",
                }}
              >
                {getInLineLabel}
              </button>

              <button
                onClick={onStepOut}
                disabled={disableStepOut}
                style={{
                  flex: 1,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "2px solid #ddd",
                  background: "white",
                  fontWeight: 900,
                  cursor: disableStepOut ? "not-allowed" : "pointer",
                  opacity: disableStepOut ? 0.6 : 1,
                }}
              >
                Step out
              </button>
            </div>
          </div>

          <div
            style={{
              border: "2px solid #eee",
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ fontWeight: 900, flex: 1 }}>The Line</div>
              {myPosition ? (
                <div style={{ color: "#555", fontWeight: 900 }}>
                  You’re #{myPosition}
                </div>
              ) : (
                <div style={{ color: "#777" }}>Not in line</div>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              {isEnded ? (
                <div style={{ color: "#b00020", fontWeight: 900 }}>
                  Meeting ended.
                </div>
              ) : isExpired ? (
                <div style={{ color: "#8a6d3b", fontWeight: 900 }}>
                  Meeting expired.
                </div>
              ) : queueDisplay.length === 0 ? (
                <div style={{ color: "#777" }}>No one in line yet.</div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {queueDisplay.map((e) => (
                    <li key={e.uid} style={{ padding: "6px 0" }}>
                      <span style={{ fontWeight: 800 }}>{e.labelDisplay}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}

      <a href="/" style={{ display: "inline-block", marginTop: 6 }}>
        ← Back
      </a>
    </main>
  );
}