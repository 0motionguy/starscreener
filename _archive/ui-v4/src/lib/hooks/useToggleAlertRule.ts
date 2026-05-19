"use client";

// StarScreener — `useToggleAlertRule` hook
//
// Optimistic PATCH /api/pipeline/alerts/rules?id=… for the `enabled` field.
// Rolls back on failure and toasts the error. Same body in both
// /alerts and /watchlist before extraction.

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AlertRule } from "../pipeline/types";
import { toastAlertError } from "../toast";

export function useToggleAlertRule(
  setRules: Dispatch<SetStateAction<AlertRule[]>>,
): (rule: AlertRule, next: boolean) => Promise<void> {
  return useCallback(
    async (rule, next) => {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)),
      );
      try {
        const res = await fetch(
          `/api/pipeline/alerts/rules?id=${encodeURIComponent(rule.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ enabled: next }),
          },
        );
        const data = (await res.json().catch(() => ({ ok: false }))) as {
          ok: boolean;
          rule?: AlertRule;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.rule) {
          throw new Error(data.error ?? "failed to update alert");
        }
        const fresh = data.rule;
        setRules((prev) => prev.map((r) => (r.id === rule.id ? fresh : r)));
      } catch (err) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
        const msg = err instanceof Error ? err.message : String(err);
        toastAlertError(msg);
      }
    },
    [setRules],
  );
}
