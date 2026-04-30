"use client";

import { useEffect, useState } from "react";

function formatUtc(d: Date): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDate(d: Date): string {
  // "MON 28.04"
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${days[d.getUTCDay()]} ${dd}.${mm}`;
}

export interface LiveClockProps {
  /** ISO string from server-render so SSR + first paint match. */
  initialIso: string;
}

export function LiveClock({ initialIso }: LiveClockProps) {
  const [now, setNow] = useState<Date>(() => new Date(initialIso));

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        marginLeft: "auto",
        textAlign: "right",
        fontFamily: "var(--font-mono)",
        fontSize: "10.5px",
        letterSpacing: "0.14em",
        color: "var(--color-text-subtle)",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          display: "block",
          color: "var(--color-text-default)",
          fontSize: "14px",
          letterSpacing: "0.10em",
        }}
      >
        {formatUtc(now)}
      </span>
      UTC · {formatDate(now)}
      <div style={{ marginTop: "4px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--color-positive)",
          }}
        >
          <i
            aria-hidden
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "99px",
              background: "var(--color-positive)",
              boxShadow: "0 0 0 3px rgba(34,197,94,0.18)",
              animation: "pulse 1.6s ease-in-out infinite",
            }}
          />
          FEED LIVE
        </span>
      </div>
    </div>
  );
}

export default LiveClock;
