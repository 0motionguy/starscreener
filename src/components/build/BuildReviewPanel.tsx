"use client";

// BuildReviewPanel — 2-column draft editor for the currently-selected
// suggested update. Five textarea fields plus a source-context aside
// listing repo / signal / strength / destination.
//
// Publish is wired to a no-op for Phase 3E (Phase 4C ships the actual
// POST /api/build/timeline endpoint). Save Draft / Regenerate / Dismiss
// keep the user moving without server state.
//
// TODO: wire AI generation + POST /api/build/timeline when Phase 4C lands.

import { useEffect, useState } from "react";

import type { BuildUpdateDraft } from "./build-signals";

interface BuildReviewPanelProps {
  /** Initial draft to load into the editor (first card by default). */
  initialDraft: BuildUpdateDraft | null;
  /** Drafts keyed by `card-${kind}` so Review-button anchors load them. */
  draftsByKey: Record<string, BuildUpdateDraft>;
  repoFullName: string;
}

const EMPTY_DRAFT: BuildUpdateDraft = {
  signalId: "empty",
  kind: "readme",
  source: "—",
  confidence: 0,
  headline: "",
  short: "",
  whatChanged: "",
  whyItMatters: "",
  whatNext: "",
  tags: [],
};

export function BuildReviewPanel({
  initialDraft,
  draftsByKey,
  repoFullName,
}: BuildReviewPanelProps) {
  const [draft, setDraft] = useState<BuildUpdateDraft>(
    initialDraft ?? EMPTY_DRAFT,
  );
  const [headline, setHeadline] = useState(draft.headline);
  const [short, setShort] = useState(draft.short);
  const [whatChanged, setWhatChanged] = useState(draft.whatChanged);
  const [whyItMatters, setWhyItMatters] = useState(draft.whyItMatters);
  const [whatNext, setWhatNext] = useState(draft.whatNext);
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "published"
  >("idle");

  // Listen for hash changes so clicking a Review button on a sibling card
  // swaps the editor without a page reload.
  useEffect(() => {
    function syncFromHash() {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;
      const next = draftsByKey[hash];
      if (next) loadDraft(next);
    }
    window.addEventListener("hashchange", syncFromHash);
    syncFromHash();
    return () => window.removeEventListener("hashchange", syncFromHash);
    // draftsByKey is stable per server render — no need to re-bind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadDraft(next: BuildUpdateDraft) {
    setDraft(next);
    setHeadline(next.headline);
    setShort(next.short);
    setWhatChanged(next.whatChanged);
    setWhyItMatters(next.whyItMatters);
    setWhatNext(next.whatNext);
    setStatus("idle");
  }

  function regenerate() {
    // Phase 3E: regeneration just resets to the deterministic template.
    // Phase 4C will swap this for an LLM call that re-drafts the headline +
    // body against the source signal.
    loadDraft(draft);
  }

  function saveDraft() {
    setStatus("saving");
    try {
      window.localStorage.setItem(
        `trendingrepo-build-draft-${repoFullName}-${draft.signalId}`,
        JSON.stringify({
          headline,
          short,
          whatChanged,
          whyItMatters,
          whatNext,
          savedAt: new Date().toISOString(),
        }),
      );
      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }

  function publish() {
    // Phase 4C lands POST /api/build/timeline. For now show the user that
    // the draft is staged but the publish wire is intentionally a no-op.
    setStatus("published");
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Build update review</h2>
        <span className="meta">user controls publish</span>
      </div>
      <div className="review-panel">
        <div className="draft-editor" id="draft-editor">
          <label className="field-label">
            Headline
            <input
              className="field"
              id="draft-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </label>
          <label className="field-label">
            Short update
            <textarea
              className="field"
              id="draft-short"
              value={short}
              onChange={(e) => setShort(e.target.value)}
            />
          </label>
          <label className="field-label">
            What changed
            <textarea
              className="field"
              value={whatChanged}
              onChange={(e) => setWhatChanged(e.target.value)}
            />
          </label>
          <label className="field-label">
            Why it matters
            <textarea
              className="field"
              value={whyItMatters}
              onChange={(e) => setWhyItMatters(e.target.value)}
            />
          </label>
          <label className="field-label">
            What is next
            <textarea
              className="field"
              value={whatNext}
              onChange={(e) => setWhatNext(e.target.value)}
            />
          </label>
          <div className="review-actions">
            <button
              className="btn primary"
              type="button"
              disabled={status === "published"}
              onClick={publish}
            >
              {status === "published" ? "Queued (Phase 4C)" : "Publish to Timeline"}
            </button>
            <button className="btn" type="button" onClick={saveDraft}>
              {status === "saved" ? "Draft saved" : "Save Draft"}
            </button>
            <button className="btn ghost" type="button" onClick={regenerate}>
              Regenerate
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => loadDraft(EMPTY_DRAFT)}
            >
              Dismiss
            </button>
          </div>
        </div>
        <aside className="source-context">
          <div className="panel-head">
            <h3>Source context</h3>
            <span className="meta">detected</span>
          </div>
          <div className="context-list">
            <div className="context-row">
              <span>Repo</span>
              <b>{repoFullName || "—"}</b>
            </div>
            <div className="context-row">
              <span>Related source</span>
              <b>{draft.source || "—"}</b>
            </div>
            <div className="context-row">
              <span>Signal</span>
              <b>{draft.kind}</b>
            </div>
            <div className="context-row">
              <span>Confidence</span>
              <b>{draft.confidence}</b>
            </div>
            <div className="context-row">
              <span>Tags</span>
              <b>{draft.tags.join(", ") || "—"}</b>
            </div>
            <div className="context-row">
              <span>Project stage</span>
              <b>Building</b>
            </div>
            <div className="context-row">
              <span>Destination</span>
              <b>Project timeline</b>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
