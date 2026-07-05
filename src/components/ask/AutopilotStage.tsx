"use client";

// AutopilotStage — the cinematic overlay the Autopilot agent draws while it
// drives the page. Portaled to <body>, sits above the search dropdown (5000)
// but below the max-z `.ask-agent-mark` labels. The frame/spotlight/cursor are
// pointer-events:none so they never block the page the agent is operating; only
// the narration ribbon + Stop button are interactive.
//
// All state is owned by AskDock and pushed in via props (the executor's
// callbacks call AskDock setState). Motion is gated on prefers-reduced-motion
// through the CSS (see autopilot.css) — the component itself stays declarative.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import "./autopilot.css";

export interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface AutopilotStageProps {
  active: boolean;
  goal: string;
  narration: string;
  status: string | null;
  cursor: { x: number; y: number } | null;
  spotlight: SpotRect | null;
  onAbort: () => void;
}

export function AutopilotStage(props: AutopilotStageProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !props.active) return null;
  return createPortal(<StageBody {...props} />, document.body);
}

function StageBody({ goal, narration, status, cursor, spotlight, onAbort }: AutopilotStageProps) {
  // Escape aborts the run.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAbort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAbort]);

  return (
    <div className="autopilot-stage" aria-live="polite">
      {/* Energized viewport frame */}
      <div className="autopilot-frame" aria-hidden="true" />

      {/* Spotlight — dims everything but the active target via a huge box-shadow */}
      {spotlight && (
        <div
          className="autopilot-spot"
          aria-hidden="true"
          style={{
            top: spotlight.top - 6,
            left: spotlight.left - 6,
            width: spotlight.width + 12,
            height: spotlight.height + 12,
          }}
        />
      )}

      {/* Ghost cursor */}
      {cursor && (
        <div
          className="autopilot-cursor"
          aria-hidden="true"
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
        >
          <span className="autopilot-cursor-ring" />
          <svg width="22" height="22" viewBox="0 0 22 22" className="autopilot-cursor-arrow">
            <path
              d="M3 2l6.5 15.5 2.2-6 6-2.2L3 2z"
              fill="var(--accent, #ff6b35)"
              stroke="#08090a"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Narration ribbon (the only interactive layer) */}
      <div className="autopilot-ribbon" role="status">
        <div className="autopilot-ribbon-head">
          <span className="autopilot-badge">
            <span className="autopilot-badge-dot" /> AUTOPILOT
          </span>
          <span className="autopilot-goal">{goal}</span>
          <button type="button" className="autopilot-stop" onClick={onAbort} aria-label="Stop autopilot">
            Stop ·&nbsp;<kbd>Esc</kbd>
          </button>
        </div>
        <div className="autopilot-line">
          {status ? (
            <span className="autopilot-status">
              <span className="autopilot-status-dot" /> {status}
            </span>
          ) : (
            <TypeLine text={narration} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Small typewriter for the narration line (instant under reduced-motion). */
function TypeLine({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setN(text.length);
      return;
    }
    setN(0);
    if (!text) return;
    let i = 0;
    const step = text.length > 90 ? 9 : 14;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, step);
    return () => window.clearInterval(id);
  }, [text]);
  const done = n >= text.length;
  return (
    <span className="autopilot-narration">
      {text.slice(0, n)}
      {!done && <span className="autopilot-caret" aria-hidden="true">▋</span>}
    </span>
  );
}
