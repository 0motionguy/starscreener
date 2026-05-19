// IdeaClaimedBox — claim CTA / current-claimer summary. The IdeaRecord
// schema doesn't have claimedBy yet (Phase 4C will add it), so v1 always
// renders the "claim" CTA wired to a stub that shows a "Coming soon"
// inline message instead of a real API call.

"use client";

import { useState } from "react";

import type { IdeaRecord } from "@/lib/ideas";

interface IdeaClaimedBoxProps {
  idea: IdeaRecord;
  signedIn: boolean;
}

export function IdeaClaimedBox({ idea, signedIn }: IdeaClaimedBoxProps) {
  const [msg, setMsg] = useState<string | null>(null);
  const isShipped = idea.buildStatus === "shipped" && idea.shippedRepoUrl;

  if (isShipped) {
    return (
      <div className="claimed-box claimed-shipped">
        <div className="claimed-label">Shipped</div>
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

  const onClaim = () => {
    if (!signedIn) {
      setMsg("Sign in to claim this idea");
      return;
    }
    setMsg(
      "Claim endpoint /api/ideas/[id]/claim lands in Phase 4C — your claim isn't persisted yet.",
    );
  };

  return (
    <div className="claimed-box claimed-open">
      <div className="claimed-label">Status</div>
      <div className="claimed-state">Open for claim</div>
      <p className="claimed-hint">
        Owning this idea means scoping the build, shipping the MVP, and
        keeping the thread alive. Pick it up when you&apos;re ready.
      </p>
      <button type="button" className="cta-primary" onClick={onClaim}>
        Claim this idea
      </button>
      {msg ? (
        <p className="claimed-msg" role="status" aria-live="polite">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
