"use client";

// IdeaSubmitModal — overlay for POSTing to /api/ideas. Opens on
// `data-idea-action="submit"` clicks anywhere on the page (button on
// IdeasBoardHero, the action menu on IdeaRow, etc.).
//
// Anon users see a sign-in prompt; the API would 401 them anyway but we
// short-circuit so the form never has to round-trip.

import { useCallback, useEffect, useState } from "react";

interface IdeaSubmitModalProps {
  signedIn: boolean;
}

interface FormState {
  title: string;
  pitch: string;
  body: string;
  targetRepos: string;
  category: string;
  tags: string;
}

const EMPTY: FormState = {
  title: "",
  pitch: "",
  body: "",
  targetRepos: "",
  category: "",
  tags: "",
};

export function IdeaSubmitModal({ signedIn }: IdeaSubmitModalProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    const onAction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const trigger = target?.closest?.<HTMLElement>(
        '[data-idea-action="submit"]',
      );
      if (!trigger) return;
      e.preventDefault();
      setOpen(true);
      setErrorMsg(null);
      setSuccessId(null);
    };
    document.addEventListener("click", onAction);
    return () => document.removeEventListener("click", onAction);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setForm(EMPTY);
    setSuccessId(null);
    setErrorMsg(null);
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!signedIn) {
        setErrorMsg("Sign in to submit an idea");
        return;
      }
      setSubmitting(true);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: form.title.trim(),
            pitch: form.pitch.trim(),
            body: form.body.trim() || null,
            targetRepos: form.targetRepos
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
            category: form.category.trim() || null,
            tags: form.tags
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
          }),
        });
        const json = (await res.json()) as
          | {
              ok: true;
              result: {
                kind: "queued" | "published" | "duplicate";
                idea: { id: string };
              };
            }
          | { ok: false; error: string };
        if (!res.ok || !("ok" in json) || !json.ok) {
          setErrorMsg(
            ("ok" in json && !json.ok && json.error) ||
              "Couldn't submit — check your title + pitch",
          );
        } else {
          setSuccessId(json.result.idea.id);
        }
      } catch {
        setErrorMsg("Network error — try again");
      } finally {
        setSubmitting(false);
      }
    },
    [form, signedIn],
  );

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal idea-submit-modal">
        <header className="modal-head">
          <h2>Submit an idea</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={close}
          >
            ×
          </button>
        </header>
        {successId ? (
          <div className="modal-body modal-success">
            <p>Submitted. We&apos;ll moderate it if this is one of your first 5.</p>
            <a className="cta-primary" href={`/ideas/${successId}`}>
              View the idea →
            </a>
          </div>
        ) : (
          <form className="modal-body" onSubmit={onSubmit}>
            <label>
              <span>Title</span>
              <input
                type="text"
                required
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              <span>One-line pitch</span>
              <input
                type="text"
                required
                maxLength={240}
                value={form.pitch}
                onChange={(e) => setForm({ ...form, pitch: e.target.value })}
              />
            </label>
            <label>
              <span>Full body (optional)</span>
              <textarea
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            <label>
              <span>Target repos (comma-separated)</span>
              <input
                type="text"
                placeholder="vercel/next.js, supabase/supabase"
                value={form.targetRepos}
                onChange={(e) =>
                  setForm({ ...form, targetRepos: e.target.value })
                }
              />
            </label>
            <label>
              <span>Category</span>
              <input
                type="text"
                placeholder="DX, agents, infra, …"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <label>
              <span>Tags (comma-separated)</span>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </label>
            {errorMsg ? (
              <div className="modal-error" role="alert">
                {errorMsg}
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="cta-secondary" onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className="cta-primary"
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit idea"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
