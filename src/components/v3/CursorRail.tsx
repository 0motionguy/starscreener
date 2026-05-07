"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function CursorRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const latestYRef = useRef(0);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function paintGlow(visible: boolean, moving: boolean) {
    const glow = glowRef.current;
    if (!glow) return;

    glow.style.opacity = visible ? "1" : "0";
    glow.style.transform = `translate3d(0, ${latestYRef.current - 18}px, 0)`;
    glow.style.background = moving
      ? "var(--v3-acc-soft)"
      : "var(--v3-line-soft)";
    glow.style.borderColor = moving
      ? "var(--v3-acc)"
      : "var(--v3-line-std)";
    glow.style.boxShadow = moving ? "0 0 18px var(--v3-acc-glow)" : "none";
  }

  function scheduleMovePaint() {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      paintGlow(true, true);
    });
  }

  return (
    <div
      ref={railRef}
      className={cn("v3-cursor-rail", className)}
      onMouseMove={(event) => {
        const rect = railRef.current?.getBoundingClientRect();
        if (!rect) return;

        latestYRef.current =
          event.clientY - rect.top + (railRef.current?.scrollTop ?? 0);
        scheduleMovePaint();

        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          paintGlow(true, false);
        }, 180);
      }}
      onMouseLeave={() => {
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        paintGlow(false, false);
      }}
    >
      <div
        ref={glowRef}
        aria-hidden
        className="v3-cursor-rail-glow"
        style={{
          opacity: 0,
          transform: "translate3d(0, -18px, 0)",
          background: "var(--v3-line-soft)",
          borderColor: "var(--v3-line-std)",
          boxShadow: "none",
        }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
