"use client";

// AGN-845 — Floating in-app feedback / bug-report widget.
//
// A bottom-right "Feedback" button that opens a modal with a type radio
// (bug / feature / other), a description textarea, and an optional email
// field. Submission posts to /api/feedback (Zod-validated, rate-limited,
// forwards to Sentry's user-feedback channel when configured).
//
// Modal pattern matches src/components/ui/ConfirmDialog.tsx — native
// <dialog> element, no Radix / HeadlessUI dep, ESC + backdrop click =
// cancel, focus trap and scroll lock are free from showModal().

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";

import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type FeedbackType = "bug" | "feature" | "other";

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "other", label: "Other" },
];

interface FeedbackApiResponse {
  ok: boolean;
  error?: string;
  forwarded?: "sentry" | "log-only";
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Open / close <dialog> in lockstep with state. showModal() handles
  // focus trap, scroll lock, and the ::backdrop pseudo-element for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => messageRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const resetForm = useCallback(() => {
    setType("bug");
    setMessage("");
    setEmail("");
    setError(null);
    setSubmitted(false);
  }, []);

  const closeAndReset = useCallback(() => {
    setOpen(false);
    // Defer reset until the close transition completes so the user
    // doesn't see the form snap back to the blank state mid-fade.
    setTimeout(resetForm, 200);
  }, [resetForm]);

  // ESC → cancel.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (submitting) return;
      closeAndReset();
    },
    [submitting, closeAndReset],
  );

  // Backdrop click → cancel. Backdrop is the <dialog> itself when the
  // click target equals the dialog node (form is in a wrapper).
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (submitting) return;
      if (event.target === dialogRef.current) {
        closeAndReset();
      }
    },
    [submitting, closeAndReset],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (message.trim().length < 3) {
      setError("Description must be at least 3 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        type,
        message: message.trim(),
      };
      if (email.trim()) body.email = email.trim();
      if (typeof window !== "undefined") {
        body.pageUrl = window.location.href;
        body.userAgent = window.navigator.userAgent;
      }
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as FeedbackApiResponse;
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      setSubmitted(true);
      // Toast confirms submission via the shared sonner-backed helper so
      // it stays visible after the modal auto-closes (AGN-610).
      toast.success("Thanks — feedback sent");
      // Auto-close after a short success display so the user sees the
      // confirmation but doesn't have to click again.
      setTimeout(() => closeAndReset(), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating launcher button — bottom-right, above MobileNav (z-40)
          but below the modal backdrop. Hidden on small screens where
          the bottom bar already takes that corner; opens via /shortcut
          if needed in a future iteration. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        data-testid="feedback-widget-trigger"
        className={cn(
          "fixed bottom-4 right-4 z-40 hidden md:inline-flex items-center gap-1.5",
          "rounded-full border border-border-primary bg-bg-card px-3.5 py-2",
          "font-mono text-xs font-semibold uppercase tracking-wider text-text-primary",
          "shadow-lg hover:bg-bg-card-hover hover:border-[var(--v4-acc)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--v4-acc)]/60",
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        Feedback
      </button>

      <dialog
        ref={dialogRef}
        onCancel={handleCancel}
        onClick={handleBackdropClick}
        aria-labelledby="feedback-dialog-title"
        className={cn(
          "rounded-card border border-border-primary bg-bg-card text-text-primary shadow-xl",
          "p-0 m-auto max-w-md w-[min(92vw,28rem)]",
          "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        )}
      >
        <form onSubmit={handleSubmit} className="px-5 py-4" data-testid="feedback-widget-form">
          <div className="flex items-start justify-between gap-2">
            <h2
              id="feedback-dialog-title"
              className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary"
            >
              Send feedback
            </h2>
            <button
              type="button"
              onClick={closeAndReset}
              disabled={submitting}
              aria-label="Close feedback dialog"
              className="text-text-tertiary hover:text-text-primary disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {submitted ? (
            <p
              className="mt-4 text-sm text-text-secondary"
              role="status"
              data-testid="feedback-widget-success"
            >
              Thanks — submission received.
            </p>
          ) : (
            <>
              <fieldset className="mt-4">
                <legend className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  Type
                </legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((opt) => {
                    const checked = type === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          "inline-flex items-center gap-1.5 cursor-pointer",
                          "rounded-md border px-2.5 py-1 font-mono text-xs",
                          checked
                            ? "border-[var(--v4-acc)] bg-[var(--v4-acc)]/10 text-text-primary"
                            : "border-border-primary bg-bg-muted text-text-secondary hover:bg-bg-card-hover",
                        )}
                      >
                        <input
                          type="radio"
                          name="feedback-type"
                          value={opt.value}
                          checked={checked}
                          onChange={() => setType(opt.value)}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-4 flex flex-col gap-1">
                <label
                  htmlFor="feedback-message"
                  className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
                >
                  Description
                </label>
                <textarea
                  id="feedback-message"
                  ref={messageRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What happened? What did you expect?"
                  maxLength={4000}
                  rows={5}
                  required
                  minLength={3}
                  className="px-3 py-2 font-mono text-sm placeholder:text-text-tertiary focus:outline-none resize-y rounded-md border border-border-primary bg-bg-muted text-text-primary"
                />
                <span className="self-end text-[10px] text-text-tertiary tabular-nums">
                  {message.trim().length}/4000
                </span>
              </div>

              <div className="mt-2 flex flex-col gap-1">
                <label
                  htmlFor="feedback-email"
                  className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
                >
                  Email (optional — for follow-up)
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="px-3 py-2 font-mono text-sm placeholder:text-text-tertiary focus:outline-none rounded-md border border-border-primary bg-bg-muted text-text-primary"
                />
              </div>

              {error ? (
                <p
                  className="mt-3 text-[11px] text-[var(--v4-red)]"
                  role="alert"
                  data-testid="feedback-widget-error"
                >
                  {error}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAndReset}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-text-primary hover:bg-bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || message.trim().length < 3}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v4-acc)]/60 bg-[var(--v4-acc)]/10 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--v4-acc)] hover:bg-[var(--v4-acc)]/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}

export default FeedbackWidget;
