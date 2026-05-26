"use client";

// Client-side button that POSTs /api/repos/[owner]/[name]/aiso to enqueue an
// AISO.tools rescan. The endpoint applies per-IP 60s rate limiting, so the
// button locks itself for 60s on success. Visual states: idle → loading →
// queued (success) → rate-limited / error. Server route also caches GET for
// 30s so the page won't immediately reflect the new scan — we surface that
// via a short hint instead of polling.

import { useState } from "react";

interface RepoAisoRescanButtonProps {
  fullName: string;
}

type RescanState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "queued"; queuedAt: string; cooldownEndsAt: number }
  | { kind: "rate-limited"; retryAfterMs: number; until: number }
  | { kind: "error"; message: string };

export function RepoAisoRescanButton({ fullName }: RepoAisoRescanButtonProps) {
  const [state, setState] = useState<RescanState>({ kind: "idle" });

  const onClick = async () => {
    if (state.kind === "loading") return;
    if (state.kind === "queued" && Date.now() < state.cooldownEndsAt) return;
    if (state.kind === "rate-limited" && Date.now() < state.until) return;

    setState({ kind: "loading" });

    try {
      const [owner, name] = fullName.split("/");
      const response = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/aiso`,
        { method: "POST", cache: "no-store" },
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        const retryAfterMs =
          typeof data?.retryAfterMs === "number" ? data.retryAfterMs : 60_000;
        setState({
          kind: "rate-limited",
          retryAfterMs,
          until: Date.now() + retryAfterMs,
        });
        return;
      }

      if (!response.ok || data?.ok === false) {
        setState({
          kind: "error",
          message: typeof data?.error === "string" ? data.error : "Rescan failed",
        });
        return;
      }

      setState({
        kind: "queued",
        queuedAt: typeof data?.queuedAt === "string" ? data.queuedAt : new Date().toISOString(),
        cooldownEndsAt: Date.now() + 60_000,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  const label = (() => {
    switch (state.kind) {
      case "loading":
        return "Queueing…";
      case "queued":
        return "Queued · scan pending";
      case "rate-limited":
        return `Rate limited · retry in ${Math.ceil((state.until - Date.now()) / 1000)}s`;
      case "error":
        return `Error · ${state.message}`;
      default:
        return "Rescan with AISO.tools";
    }
  })();

  const disabled =
    state.kind === "loading" ||
    (state.kind === "queued" && Date.now() < state.cooldownEndsAt) ||
    (state.kind === "rate-limited" && Date.now() < state.until);

  return (
    <button
      type="button"
      className={`btn ${state.kind === "queued" ? "ghost" : "primary"} sm`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
