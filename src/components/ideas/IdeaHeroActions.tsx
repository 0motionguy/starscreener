"use client";

// IdeaHeroActions — 4 hero buttons + side-stack action set. Claim and
// Save POST to existing endpoints. Generate brief deep-links to the
// brief tab via URL param (server-side, no client-only modal toggle).
// Attach repo POSTs to /api/ideas/[id]/attach-repo with a stub repo URL
// pulled from a window.prompt — full picker UI is Phase 4D.

import { useState, useTransition } from "react";

interface IdeaHeroActionsProps {
  ideaId: string;
  /** Whether the caller is signed in. Anonymous gets "Sign in" prompts. */
  signedIn: boolean;
  /** "hero" → 4 action buttons under the title.
   *  "side" → same 4 buttons on the right rail. */
  placement: "hero" | "side";
  /** Currently-claimed-by user id (if any). Disables "Claim" when set. */
  claimedBy?: string;
}

export function IdeaHeroActions({
  ideaId,
  signedIn,
  placement,
  claimedBy,
}: IdeaHeroActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"claim" | "save" | "attach" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const claim = () => {
    if (!signedIn) {
      setMsg("Sign in to claim ideas");
      return;
    }
    if (claimedBy) {
      setMsg("Already claimed");
      return;
    }
    setBusy("claim");
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/ideas/${ideaId}/claim`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          setMsg("Claimed");
        } else if (res.status === 401) {
          setMsg("Sign in to claim ideas");
        } else if (res.status === 409) {
          setMsg("Already claimed");
        } else {
          setMsg("Could not claim — try again");
        }
      } catch {
        setMsg("Network error");
      } finally {
        setBusy(null);
      }
    });
  };

  const save = () => {
    if (!signedIn) {
      setMsg("Sign in to save ideas");
      return;
    }
    setBusy("save");
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/me/saved`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId }),
        });
        if (res.ok) {
          setMsg("Saved");
        } else if (res.status === 401) {
          setMsg("Sign in to save ideas");
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

  const attach = () => {
    if (!signedIn) {
      setMsg("Sign in to attach a repo");
      return;
    }
    const repoUrl =
      typeof window !== "undefined"
        ? window.prompt("Attach a GitHub repo URL (owner/name or full URL):", "")
        : null;
    if (!repoUrl) return;
    setBusy("attach");
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/ideas/${ideaId}/attach-repo`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl }),
        });
        if (res.ok) {
          setMsg("Repo attached");
        } else if (res.status === 401) {
          setMsg("Sign in to attach a repo");
        } else if (res.status === 422) {
          setMsg("Invalid repo URL");
        } else {
          setMsg("Could not attach — try again");
        }
      } catch {
        setMsg("Network error");
      } finally {
        setBusy(null);
      }
    });
  };

  const containerClass =
    placement === "hero" ? "summary-actions" : "side-actions";

  return (
    <div className={containerClass}>
      <button
        type="button"
        className="btn primary"
        disabled={busy !== null || isPending || Boolean(claimedBy)}
        onClick={claim}
      >
        {busy === "claim" ? "Claiming…" : claimedBy ? "Claimed" : "Claim idea"}
      </button>
      <a
        className="btn"
        href={`/ideas/${ideaId}?tab=brief`}
        data-go-tab="brief"
      >
        Generate brief
      </a>
      <button
        type="button"
        className="btn ghost"
        disabled={busy !== null || isPending}
        onClick={attach}
      >
        {busy === "attach" ? "Attaching…" : "Attach repo"}
      </button>
      <button
        type="button"
        className="btn ghost"
        disabled={busy !== null || isPending}
        onClick={save}
      >
        {busy === "save" ? "Saving…" : "Save"}
      </button>
      {msg ? (
        <span className="action-msg" role="status" aria-live="polite">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
