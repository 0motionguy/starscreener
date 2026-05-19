"use client";

// Quick-mode idea composer. Full mode (body, stack picker, surfaces
// checklist) slides to next sprint per the strategy doc — this is the
// minimum viable "what should be built" form.
//
// Auth: piggy-backs on the existing user-token setup. If the user has
// no token yet, the button is disabled and we surface a short pointer
// message. Token acquisition UX (GitHub OAuth / magic link) is a P1
// dependency we explicitly called out in the strategy audit.

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";

import type { PublicIdea } from "@/lib/ideas";
import { cn } from "@/lib/utils";

type CreateIdeaApiResponse =
  | {
      ok: true;
      result:
        | { kind: "queued"; idea: PublicIdea }
        | { kind: "published"; idea: PublicIdea }
        | { kind: "duplicate"; idea: PublicIdea };
    }
  | {
      ok: false;
      error: string;
      code?: string;
      details?: { field: string; message: string }[];
    };

interface IdeaComposerProps {
  onPublished?: (idea: PublicIdea, kind: "queued" | "published" | "duplicate") => void;
}

export function IdeaComposer({ onPublished }: IdeaComposerProps) {
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [targetRepo, setTargetRepo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMissing, setAuthMissing] = useState(false);

  const disabled = submitting || title.trim().length < 8 || pitch.trim().length < 20;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        pitch: pitch.trim(),
      };
      if (targetRepo.trim()) {
        body.targetRepos = [targetRepo.trim()];
      }
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401 || res.status === 503) {
        setAuthMissing(true);
        return;
      }
      const payload = (await res.json()) as CreateIdeaApiResponse;
      if (!payload.ok) {
        const detailMsg = payload.details?.map((d) => d.message).join("; ");
        throw new Error(detailMsg || payload.error);
      }
      setTitle("");
      setPitch("");
      setTargetRepo("");
      if (onPublished) {
        onPublished(payload.result.idea, payload.result.kind);
      } else if (
        typeof window !== "undefined" &&
        payload.result.kind === "published"
      ) {
        // Default: refresh so the new card appears in the feed. Queued
        // ideas don't render publicly until moderation, so no refresh —
        // the success state stays in the composer chrome.
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="v2-card p-4 space-y-3"
      data-testid="idea-composer"
    >
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ship a 1-line idea that doesn't exist yet"
          maxLength={80}
          className="px-3 py-2 font-mono text-sm placeholder:text-text-tertiary focus:outline-none"
          style={{
            background: "var(--v2-bg-100)",
            border: "1px solid var(--v2-line-200)",
            borderRadius: 2,
            color: "var(--v2-ink-100)",
          }}
        />
        <span className="text-[10px] text-text-tertiary tabular-nums self-end">
          {title.trim().length}/80
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          Pitch
        </label>
        <textarea
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="Why this matters in one breath. 20-280 chars. No URLs (use full-mode composer for links)."
          maxLength={280}
          rows={3}
          className="px-3 py-2 font-mono text-sm placeholder:text-text-tertiary focus:outline-none resize-none"
          style={{
            background: "var(--v2-bg-100)",
            border: "1px solid var(--v2-line-200)",
            borderRadius: 2,
            color: "var(--v2-ink-100)",
          }}
        />
        <span className="text-[10px] text-text-tertiary tabular-nums self-end">
          {pitch.trim().length}/280
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          Targets (optional) — GitHub repo, owner/name
        </label>
        <input
          type="text"
          value={targetRepo}
          onChange={(e) => setTargetRepo(e.target.value)}
          placeholder="vercel/next.js"
          className="px-3 py-2 font-mono text-sm placeholder:text-text-tertiary focus:outline-none"
          style={{
            background: "var(--v2-bg-100)",
            border: "1px solid var(--v2-line-200)",
            borderRadius: 2,
            color: "var(--v2-ink-100)",
          }}
        />
      </div>

      {authMissing ? (
        <p className="text-[11px] text-[var(--v4-amber)]">
          Sign in to post ideas. Browser auth flow lands next sprint.
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-[var(--v4-red)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="v2-mono" style={{ fontSize: 10, color: "var(--v2-ink-400)" }}>
          {"// FIRST 5 POSTS LAND IN MODERATION · AFTER THAT, AUTO-PUBLISH"}
        </p>
        <button
          type="submit"
          disabled={disabled}
          className={cn(
            "v2-btn v2-btn-primary",
            disabled && "cursor-not-allowed opacity-50",
          )}
          style={{ minHeight: 40 }}
        >
          {submitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden style={{ marginRight: 8 }} />
          ) : (
            <Send className="size-4" aria-hidden style={{ marginRight: 8 }} />
          )}
          POST IDEA
        </button>
      </div>
    </form>
  );
}

export default IdeaComposer;
