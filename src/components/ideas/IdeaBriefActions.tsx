"use client";

// IdeaBriefActions — client island wired into IdeaBriefTab.
//
// The tab itself stays a server component (renders blocks from data); only
// the four-button action row needs hooks + fetch, so it lives here in
// isolation. Mirrors the IdeaHeroActions pattern (Phase 4C).
//
// Buttons:
//   - Regenerate brief → POST /api/ideas/[id]/brief/regenerate
//                        Currently 501 (llm_not_configured) — message is
//                        surfaced honestly in the status line.
//   - Save brief       → POST /api/ideas/[id]/brief/save
//                        Sends the current stitched markdown + last-known
//                        briefVersion for optimistic concurrency.
//   - Claim idea       → deep-link to ?tab=overview (claim CTA there).
//   - Attach repo      → stays disabled (Phase 4D).
//
// briefMarkdown stitch: if the parent passes a persisted markdown payload
// we round-trip that as-is. Otherwise we stitch the visible blocks into a
// markdown doc here so first-save lands a real payload, not the empty
// string. Caller is responsible for re-fetching the idea after a 200 so
// the briefVersion in props bumps.

import { useState, useTransition } from "react";

interface IdeaBriefActionsProps {
  ideaId: string;
  /**
   * Markdown to POST on Save. If the idea has no persisted brief yet,
   * the parent stitches the static template into markdown so the first
   * save isn't an empty doc.
   */
  briefMarkdown: string;
  /**
   * Last-known briefVersion from the server. Sent as `version` for
   * optimistic concurrency. Omit (or pass 0) on first-ever save.
   */
  briefVersion?: number;
}

export function IdeaBriefActions({
  ideaId,
  briefMarkdown,
  briefVersion,
}: IdeaBriefActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"regen" | "save" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const regenerate = () => {
    setBusy("regen");
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/ideas/${ideaId}/brief/regenerate`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          setMsg("Regenerated — refresh to see the new brief");
        } else if (res.status === 401) {
          setMsg("Sign in to regenerate the brief");
        } else if (res.status === 403) {
          setMsg("Claim the idea first");
        } else if (res.status === 501) {
          setMsg("AI regeneration not configured yet");
        } else if (res.status === 429) {
          setMsg("Slow down — try again in a moment");
        } else {
          setMsg("Could not regenerate — try again");
        }
      } catch {
        setMsg("Network error");
      } finally {
        setBusy(null);
      }
    });
  };

  const save = () => {
    setBusy("save");
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/ideas/${ideaId}/brief/save`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            briefMarkdown,
            ...(briefVersion !== undefined ? { version: briefVersion } : {}),
          }),
        });
        if (res.ok) {
          setMsg("Saved");
        } else if (res.status === 401) {
          setMsg("Sign in to save the brief");
        } else if (res.status === 403) {
          setMsg("Claim the idea first");
        } else if (res.status === 409) {
          setMsg("Brief changed in another tab — refresh and retry");
        } else if (res.status === 429) {
          setMsg("Slow down — try again in a moment");
        } else if (res.status === 400) {
          setMsg("Could not save — content invalid");
        } else {
          setMsg("Could not save — try again");
        }
      } catch {
        setMsg("Network error");
      } finally {
        setBusy(null);
      }
    });
  };

  const regenLabel =
    busy === "regen" || isPending ? "Regenerating…" : "Regenerate brief";
  const saveLabel = busy === "save" || isPending ? "Saving…" : "Save brief";

  return (
    <>
      <div className="brief-actions">
        <button
          type="button"
          className="btn primary"
          onClick={regenerate}
          disabled={busy !== null}
          aria-busy={busy === "regen"}
        >
          {regenLabel}
        </button>
        <button
          type="button"
          className="btn"
          onClick={save}
          disabled={busy !== null || briefMarkdown.length === 0}
          aria-busy={busy === "save"}
        >
          {saveLabel}
        </button>
        <a
          className="btn ghost"
          href={`/ideas/${ideaId}?tab=overview`}
          data-claim-from-brief
        >
          Claim idea
        </a>
        <button
          type="button"
          className="btn ghost"
          disabled
          title="Coming soon — repo attach UI ships with Phase 4D."
        >
          Attach repo
        </button>
      </div>
      {msg ? (
        <p className="brief-action-status" role="status" aria-live="polite">
          {msg}
        </p>
      ) : null}
    </>
  );
}
