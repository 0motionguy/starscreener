"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function CursorRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [state, setState] = useState({
    y: 0,
    visible: false,
    moving: false,
  });

  return (
    <div
      ref={railRef}
      className={cn("v3-cursor-rail", className)}
      onMouseMove={(event) => {
        const rect = railRef.current?.getBoundingClientRect();
        if (!rect) return;
        setState({
          y: event.clientY - rect.top + (railRef.current?.scrollTop ?? 0),
          visible: true,
          moving: true,
        });
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setState((current) => ({ ...current, moving: false }));
        }, 180);
      }}
      onMouseLeave={() => {
        setState((current) => ({ ...current, visible: false, moving: false }));
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }}
    >
      <div
        aria-hidden
        className="v3-cursor-rail-glow"
        style={{
          opacity: state.visible ? 1 : 0,
          transform: `translate3d(0, ${state.y - 18}px, 0)`,
          background: state.moving
            ? "var(--v3-acc-soft)"
            : "var(--v3-line-soft)",
          borderColor: state.moving
            ? "var(--v3-acc)"
            : "var(--v3-line-std)",
          boxShadow: state.moving ? "0 0 18px var(--v3-acc-glow)" : "none",
        }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
