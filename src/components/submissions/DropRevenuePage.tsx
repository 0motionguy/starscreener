"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  BadgeCheck,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Mode = "trustmrr_link" | "self_report";

interface PublicRevenueSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  mode: Mode;
  status: "pending_moderation" | "approved" | "rejected";
  submittedAt: string;
  moderatedAt: string | null;
  trustmrrSlug?: string;
  mrrCents?: number;
  paymentProvider?: string;
}

interface SuccessState {
  kind: "created" | "duplicate";
  submission: PublicRevenueSubmission;
}

const PROVIDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "stripe", label: "Stripe" },
  { value: "lemonsqueezy", label: "LemonSqueezy" },
  { value: "polar", label: "Polar" },
  { value: "paddle", label: "Paddle" },
  { value: "dodopayment", label: "DodoPayments" },
  { value: "revenuecat", label: "RevenueCat" },
  { value: "superwall", label: "Superwall" },
  { value: "creem", label: "Creem" },
  { value: "other", label: "Other / self-billed" },
];

function parseDollarsToCents(raw: string): number | null {
  const trimmed = raw.replace(/[,$\s]/g, "");
  if (!trimmed) return null;
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function DropRevenuePage() {
  const [mode, setMode] = useState<Mode>("trustmrr_link");
  const [repo, setRepo] = useState("");
  const [trustmrrSlug, setTrustmrrSlug] = useState("");
  const [mrrDollars, setMrrDollars] = useState("");
  const [customers, setCustomers] = useState("");
  const [paymentProvider, setPaymentProvider] = useState("stripe");
  const [proofUrl, setProofUrl] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!repo.trim()) return false;
    if (mode === "trustmrr_link") return trustmrrSlug.trim().length > 0;
    return mrrDollars.trim().length > 0 && paymentProvider.length > 0;
  }, [submitting, repo, mode, trustmrrSlug, mrrDollars, paymentProvider]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        mode,
        repo: repo.trim(),
        contact: contact.trim() || null,
        notes: notes.trim() || null,
      };
      if (mode === "trustmrr_link") {
        body.trustmrrSlug = trustmrrSlug.trim();
      } else {
        const cents = parseDollarsToCents(mrrDollars);
        if (cents === null) {
          throw new Error("MRR must be a non-negative number (dollars)");
        }
        body.mrrCents = cents;
        body.paymentProvider = paymentProvider;
        if (customers.trim()) body.customers = customers.trim();
        if (proofUrl.trim()) body.proofUrl = proofUrl.trim();
      }

      const res = await fetch("/api/submissions/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as
        | {
            ok: true;
            result: {
              kind: "created" | "duplicate";
              submission: PublicRevenueSubmission;
            };
          }
        | { ok: false; error: string };
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setSuccess({
        kind: payload.result.kind,
        submission: payload.result.submission,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[900px] mx-auto px-4 md:px-6 py-6 md:py-10">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <BadgeCheck className="size-5 text-[var(--v4-money)]" aria-hidden />
              Claim or Submit Revenue
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// founder signal on your repo page"}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-text-secondary">
            Two options. Either link an existing verified-revenue profile, or
            self-report your MRR. Both paths go through a short moderation
            queue before your repo page shows the signal. Self-reported entries
            display with a clearly different card so readers can tell verified
            from unverified at a glance.
          </p>
        </header>

        {success ? (
          <SuccessPanel state={success} onReset={() => setSuccess(null)} />
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-6 v2-card p-5"
          >
            <ModeToggle mode={mode} onChange={setMode} />

            <Field
              label="GitHub repo"
              hint="owner/name or full URL"
              required
            >
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="vercel/next.js"
                autoComplete="off"
                required
                className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </Field>

            {mode === "trustmrr_link" ? (
              <Field
                label="Verified profile slug or URL"
                hint="Paste the slug or full profile URL from your verified-revenue listing"
                required
              >
                <input
                  type="text"
                  value={trustmrrSlug}
                  onChange={(e) => setTrustmrrSlug(e.target.value)}
                  placeholder="your-startup-slug"
                  autoComplete="off"
                  required
                  className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="MRR (USD)" hint="monthly recurring revenue" required>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={mrrDollars}
                      onChange={(e) => setMrrDollars(e.target.value)}
                      placeholder="1250"
                      required
                      className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </Field>
                  <Field label="Paying customers" hint="optional">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customers}
                      onChange={(e) => setCustomers(e.target.value)}
                      placeholder="42"
                      className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </Field>
                </div>

                <Field label="Payment provider" required>
                  <select
                    value={paymentProvider}
                    onChange={(e) => setPaymentProvider(e.target.value)}
                    className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    {PROVIDER_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Proof URL"
                  hint="Optional — a public dashboard, tweet, or press mention"
                >
                  <input
                    type="url"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder="https://x.com/you/status/..."
                    className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </Field>
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Contact" hint="email or X handle, optional">
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@startup.com or @handle"
                  className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </Field>
              <Field label="Notes to moderator" hint="optional">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything we should know"
                  className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </Field>
            </div>

            {error ? (
              <div className="rounded-md border border-down/60 bg-down/5 px-3 py-2 text-sm text-[var(--v4-red)]">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-primary pt-5">
              <p className="text-[11px] text-text-tertiary inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden />
                Moderation gate — nothing ships to your repo page until we
                review.
              </p>
              <button
                type="submit"
                disabled={!canSubmit}
                className="v2-btn v2-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden style={{ marginRight: 8 }} />
                ) : (
                  <Sparkles className="size-4" aria-hidden style={{ marginRight: 8 }} />
                )}
                SUBMIT FOR MODERATION
              </button>
            </div>
          </form>
        )}

        <aside className="mt-6 flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary">
          <span>Just want to drop a repo?</span>
          <Link href="/submit" className="text-text-secondary hover:text-text-primary">
            Go to Drop Repo →
          </Link>
          <span aria-hidden>·</span>
          <Link href="/revenue" className="text-text-secondary hover:text-text-primary">
            See Revenue Terminal →
          </Link>
        </aside>
      </div>
    </main>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
}) {
  const options: Array<{ value: Mode; label: string; hint: string }> = [
    {
      value: "trustmrr_link",
      label: "Link verified profile",
      hint: "Revenue verified via your payment provider",
    },
    {
      value: "self_report",
      label: "Self-report",
      hint: "Shows as founder-reported, not verified",
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        Mode
      </span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = opt.value === mode;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={
                "flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition " +
                (active
                  ? "border-brand bg-brand/10 text-text-primary"
                  : "border-border-primary bg-bg-muted text-text-secondary hover:text-text-primary")
              }
            >
              <span className="font-mono text-sm font-semibold">
                {opt.label}
              </span>
              <span className="text-[11px] text-text-tertiary">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
        {required ? <span className="text-[var(--v4-red)]"> *</span> : null}
        {hint ? (
          <span className="ml-1.5 text-text-tertiary normal-case tracking-normal">
            — {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function SuccessPanel({
  state,
  onReset,
}: {
  state: SuccessState;
  onReset: () => void;
}) {
  const { submission, kind } = state;
  return (
    <section
      className="v2-card p-5"
      style={{
        background: "rgba(34, 197, 94, 0.06)",
        borderColor: "var(--v2-sig-green)",
      }}
    >
      <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--v4-money)]">
        <BadgeCheck className="size-4" aria-hidden />
        {kind === "duplicate" ? "Already in the queue" : "Submitted"}
      </div>
      <h2 className="mt-2 text-lg font-semibold text-text-primary">
        {submission.fullName}
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Mode: <strong>{submission.mode === "trustmrr_link" ? "Verified profile" : "Self-reported"}</strong>
        {" · "}
        Status: <strong>{submission.status}</strong>
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <Link
          href={`/repo/${submission.fullName}`}
          className="inline-flex items-center gap-1 rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 text-text-secondary hover:text-text-primary"
        >
          View repo page
          <ExternalLink className="size-3" aria-hidden />
        </Link>
        <a
          href={submission.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 text-text-secondary hover:text-text-primary"
        >
          Open on GitHub
          <ExternalLink className="size-3" aria-hidden />
        </a>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 text-text-secondary hover:text-text-primary"
        >
          Submit another
        </button>
      </div>
    </section>
  );
}
