"use client";

// AisoRetryButton
//
// Surfaces a terminal-styled retry affordance when a repo's AISO scan is in
// a non-completed state. Posts to `/api/repos/:owner/:name/aiso` and mirrors
// the endpoint's 60s cooldown on the client so users can't spam.
//
// Intentional scope (matches the spec in the task brief):
//   - scanned → renders nothing (no action offered)
//   - queued → "[ Refresh status ]"
//   - failed / rate_limited → "[ Retry scan ]"
//   - none → renders nothing (we don't guess — if the server says never
//     scanned, the button has nothing to retry)
//
// State machine:
//   idle → submitting → (queued | error) → cooldown(60s) → idle
// The cooldown starts on any terminal response (success OR error) so a
// failure loop can't hammer the endpoint either.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";

type ServerStatus =
  | "scanned"
  | "queued"
  | "rate_limited"
  | "failed"
  | "none";

interface AisoRetryButtonProps {
  owner: string;
  name: string;
  status: ServerStatus;
}

const COOLDOWN_MS = 60_000;

interface PostSuccess {
  ok: true;
  status: "queued";
  queuedAt: string;
}

interface PostError {
  ok: false;
  error: string;
  retryAfterMs?: number;
}

function labelFor(status: ServerStatus, currentStatus: ServerStatus): string {
  const effective = currentStatus ?? status;
  if (effective === "queued") return "[ Refresh status ]";
  return "[ Retry scan ]";
}

export function AisoRetryButton({
  owner,
  name,
  status,
}: AisoRetryButtonProps) {
  const [currentStatus, setCurrentStatus] = useState<ServerStatus>(status);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const mountedRef = useRef(true);

  // Sync when parent prop changes (e.g., RSC refresh surfaced a new status).
  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Tick once a second while a cooldown is active so the remaining-seconds
  // count rerenders. No interval when not cooling down — keeps the render
  // graph quiet on the common path.
  useEffect(() => {
    if (cooldownUntil === null) return;
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      const tickNow = Date.now();
      setNow(tickNow);
      if (tickNow >= cooldownUntil) {
        setCooldownUntil(null);
      }
    }, 1_000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemainingSec = useMemo(() => {
    if (cooldownUntil === null) return 0;
    return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  }, [cooldownUntil, now]);

  const disabled = busy || cooldownRemainingSec > 0;

  const onClick = useCallback(async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/aiso`,
        {
          method: "POST",
          headers: { accept: "application/json" },
        },
      );

      const body = (await res.json().catch(() => null)) as
        | PostSuccess
        | PostError
        | null;

      if (!mountedRef.current) return;

      if (res.ok && body && body.ok) {
        setCurrentStatus("queued");
        toast.success("AISO rescan queued");
      } else if (res.status === 429) {
        const retryAfterMs = body && "retryAfterMs" in body && body.retryAfterMs
          ? body.retryAfterMs
          : COOLDOWN_MS;
        setCooldownUntil(Date.now() + retryAfterMs);
        toast.error("Rate limited — try again shortly");
      } else {
        const msg = body && "error" in body && body.error
          ? body.error
          : `Rescan request failed (${res.status})`;
        toast.error(msg);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : "Rescan request failed";
        toast.error(msg);
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        // Start cooldown regardless of outcome so the button can't be hammered
        // on persistent failures. Do not shorten an existing rate-limit cooldown.
        setCooldownUntil((prev) => {
          const next = Date.now() + COOLDOWN_MS;
          return prev !== null && prev > next ? prev : next;
        });
      }
    }
  }, [disabled, name, owner]);

  // Spec: if status is `scanned` (already has a result), render nothing.
  // Also render nothing for `none` — we don't guess.
  if (currentStatus === "scanned" || currentStatus === "none") {
    return null;
  }

  const buttonLabel = busy
    ? "[ Submitting... ]"
    : cooldownRemainingSec > 0
      ? `[ Wait ${cooldownRemainingSec}s ]`
      : labelFor(status, currentStatus);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-050)",
        color: "var(--v4-ink-200)",
        borderRadius: 4,
      }}
    >
      {buttonLabel}
    </button>
  );
}

export default AisoRetryButton;
