"use client";
import { useEffect, useRef, useState } from "react";

const FOCUS = 25 * 60;
const BREAK = 5 * 60;

export default function Pomodoro() {
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [left, setLeft] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
      return () => { if (ref.current) clearInterval(ref.current); };
    }
  }, [running]);

  useEffect(() => {
    if (left === 0) {
      setRunning(false);
      const nextMode = mode === "focus" ? "break" : "focus";
      setMode(nextMode);
      setLeft(nextMode === "focus" ? FOCUS : BREAK);
      if (typeof Notification !== "undefined" && Notification.permission === "granted")
        new Notification(mode === "focus" ? "Break time! 🎉" : "Back to it 💪");
    }
  }, [left, mode]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const total = mode === "focus" ? FOCUS : BREAK;
  const pct = ((total - left) / total) * 100;

  function reset() {
    setRunning(false);
    setLeft(mode === "focus" ? FOCUS : BREAK);
  }

  return (
    <div className="card p-5 flex items-center gap-5">
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${pct} 100`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
          {mm}:{ss}
        </div>
      </div>
      <div className="flex-1">
        <p className="eyebrow">{mode === "focus" ? "Focus session" : "Break"}</p>
        <p className="text-xs text-[color:var(--ink-faint)] mt-0.5">Pomodoro — study in focused bursts</p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => {
              if (typeof Notification !== "undefined" && Notification.permission === "default")
                Notification.requestPermission();
              setRunning((r) => !r);
            }}
            className="btn-accent px-4 py-1.5 text-xs"
          >
            {running ? "Pause" : "Start"}
          </button>
          <button onClick={reset} className="btn-ghost px-3 py-1.5 text-xs">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
