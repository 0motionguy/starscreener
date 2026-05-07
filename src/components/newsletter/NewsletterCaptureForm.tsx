"use client";

// <NewsletterCaptureForm /> — anonymous email capture for the homepage hero.
//
// Tiny inline form: email input + submit button. Optimistic UX — the
// "submitted" state appears immediately on POST acknowledgment, regardless
// of whether the row was a fresh insert or an idempotent no-op (the
// /api/newsletter/subscribe route is anti-enumeration: it always returns
// `{ ok: true }` for valid emails, never reveals subscription status).
//
// States:
//   - idle:        input + button visible
//   - submitting:  button disabled, spinner-ish dots
//   - submitted:   "Check your email to confirm" message replaces form
//   - error:       inline message under input, form stays interactive
//
// v3 design tokens. No Radix, no Framer Motion — every byte matters in the
// hero. Honours the project's 30-min ISR on `/`: this is a client island
// that never breaks the static shell.

import { useState, type FormEvent } from "react";

interface NewsletterCaptureFormProps {
  /**
   * Optional override for the form's `source` field — distinguishes hero
   * vs footer vs modal placements over time. Defaults to "hero".
   */
  source?: string;
}

type FormState = "idle" | "submitting" | "submitted" | "error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NewsletterCaptureForm({
  source = "hero",
}: NewsletterCaptureFormProps = {}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setErrorMsg("Enter a valid email address.");
      setState("error");
      return;
    }
    setState("submitting");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source }),
      });
      if (!res.ok) {
        let detail = "Subscription failed. Try again.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body && typeof body.error === "string" && body.error.length > 0) {
            detail = body.error;
          }
        } catch {
          // ignore — keep default copy
        }
        setErrorMsg(detail);
        setState("error");
        return;
      }
      setState("submitted");
    } catch (err) {
      console.warn("[NewsletterCaptureForm] network error", err);
      setErrorMsg("Network error. Try again.");
      setState("error");
    }
  }

  if (state === "submitted") {
    return (
      <div
        className="rounded-[2px] px-4 py-3 inline-flex items-center gap-3"
        style={{
          background: "var(--v3-acc-soft)",
          border: "1px solid var(--v3-acc-dim)",
          color: "var(--v3-acc)",
        }}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ fontWeight: 500 }}
        >
          ✓ CHECK YOUR EMAIL
        </span>
        <span
          className="text-[13px] leading-snug"
          style={{ color: "var(--v3-ink-100)" }}
        >
          to confirm your subscription
        </span>
      </div>
    );
  }

  const submitting = state === "submitting";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1.5 max-w-md">
      <div className="flex items-stretch gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="you@example.com"
          aria-label="Email address"
          autoComplete="email"
          disabled={submitting}
          className="flex-1 min-w-0 rounded-[2px] px-3 py-2 font-mono text-[12px] focus:outline-none disabled:opacity-50"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
            color: "var(--v3-ink-100)",
          }}
        />
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-[2px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
          style={{
            background: "var(--v3-acc-soft)",
            border: "1px solid var(--v3-acc-dim)",
            color: "var(--v3-acc)",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {submitting ? "SENDING…" : "GET THE WEEKLY DIGEST →"}
        </button>
      </div>
      {errorMsg ? (
        <div
          role="alert"
          className="font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--sig-red, #ff6b6b)" }}
        >
          {errorMsg}
        </div>
      ) : (
        <div
          className="font-mono text-[10px] tracking-[0.12em]"
          style={{ color: "var(--v3-ink-400, #8a8892)" }}
        >
          Top breakouts, weekly. Double opt-in. Unsubscribe anytime.
        </div>
      )}
    </form>
  );
}

export default NewsletterCaptureForm;
