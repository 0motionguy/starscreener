"use client";

import { useCallback, useEffect, useState } from "react";

import type { IdeaRecord } from "@/lib/ideas";

interface IdeaClaimedBoxProps {
  idea: IdeaRecord;
  signedIn: boolean;
}

export function IdeaClaimedBox({ idea, signedIn }: IdeaClaimedBoxProps) {
  const [claimed, setClaimed] = useState(Boolean(idea.claimedBy));
  const [msg, setMsg] = useState<string | null>(null);
  const isShipped = idea.buildStatus === "shipped" && idea.shippedRepoUrl;

  const claim = useCallback(async () => {
    if (!signedIn) {
      setMsg("Sign in to claim this idea.");
      return;
    }
    if (idea.id.startsWith("seed-")) {
      setClaimed(true);
      setMsg("Claimed in this workspace.");
      return;
    }
    try {
      const res = await fetch(`/api/ideas/${idea.id}/claim`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setMsg(json.error ?? "Claim could not be saved.");
        return;
      }
      setClaimed(true);
      setMsg("Claimed.");
    } catch {
      setMsg("Network error while claiming.");
    }
  }, [idea.id, signedIn]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const trigger = target?.closest?.<HTMLElement>('[data-idea-action="claim"]');
      if (!trigger) return;
      event.preventDefault();
      void claim();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [claim]);

  if (isShipped) {
    return (
      <div className="claimed-box claimed-shipped visible">
        <div className="claimed-label">Launched</div>
        <a
          className="claimed-link"
          href={idea.shippedRepoUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
        >
          {idea.shippedRepoUrl}
        </a>
      </div>
    );
  }

  return (
    <div className={`claimed-box claimed-open ${claimed ? "visible" : ""}`}>
      <div className="claimed-label">{claimed ? "Claimed" : "Open"}</div>
      <div className="claimed-state">
        {claimed ? "Scoped by current builder" : "Open for claim"}
      </div>
      <p className="claimed-hint">
        Owning this idea means scoping the build, shipping the MVP, and keeping
        the evidence thread active.
      </p>
      <button type="button" className="btn primary" onClick={claim}>
        {claimed ? "Claimed" : "Claim this idea"}
      </button>
      {msg ? (
        <p className="claimed-msg" role="status" aria-live="polite">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
