"use client";

// IdeaAddRelatedRepoButton — client island for the "Add related repo"
// button on IdeaRelatedReposTab. Posts to
// /api/ideas/[id]/related-repos with a window.prompt-supplied repo
// reference. Mirrors the IdeaHeroActions "Attach repo" interaction
// pattern (prompt-based; the dedicated picker UI is a later phase).

import { useState, useTransition } from "react";

interface IdeaAddRelatedRepoButtonProps {
  ideaId: string;
  signedIn: boolean;
}

export function IdeaAddRelatedRepoButton({
  ideaId,
  signedIn,
}: IdeaAddRelatedRepoButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onClick = () => {
    if (!signedIn) {
      setMsg("Sign in to add a related repo");
      return;
    }
    const repo =
      typeof window !== "undefined"
        ? window.prompt(
            "Add a related repo (owner/name or full GitHub URL):",
            "",
          )
        : null;
    if (!repo) return;

    setBusy(true);
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/ideas/${ideaId}/related-repos`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName: repo }),
        });
        if (res.ok) {
          setMsg("Repo added");
        } else if (res.status === 401) {
          setMsg("Sign in to add a related repo");
        } else if (res.status === 403) {
          setMsg("Only the author or claimer can add a related repo");
        } else if (res.status === 409) {
          // Disambiguate the three 409 codes for the operator.
          const body = (await res.json().catch(() => null)) as {
            code?: string;
          } | null;
          if (body?.code === "ALREADY_ATTACHED") {
            setMsg("Repo is already attached as the primary");
          } else if (body?.code === "ALREADY_RELATED") {
            setMsg("Repo is already in the related list");
          } else if (body?.code === "LIMIT_REACHED") {
            setMsg("Related-repos list is full");
          } else {
            setMsg("Could not add — conflict");
          }
        } else if (res.status === 422) {
          setMsg("Invalid repo reference");
        } else {
          setMsg("Could not add — try again");
        }
      } catch {
        setMsg("Network error");
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy || isPending}
        onClick={onClick}
      >
        {busy ? "Adding…" : "Add related repo"}
      </button>
      {msg ? (
        <span className="action-msg" role="status" aria-live="polite">
          {msg}
        </span>
      ) : null}
    </>
  );
}
