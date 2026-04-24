"use client";

// TrendingRepo — Idea composer.
// Five-step flow: anchor → thesis → why-now → stack → preview. Draft state
// is kept in localStorage so a bail in step 3 is recoverable. Repo autocomplete
// uses the existing /api/search endpoint.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Hammer } from "lucide-react";
import type { IdeaStack } from "@/lib/builder/types";

const DRAFT_KEY = "tr_idea_draft_v1";

type Step = 1 | 2 | 3 | 4 | 5;

interface Draft {
  linkedRepoIds: string[];
  thesis: string;
  problem: string;
  whyNow: string;
  stack: IdeaStack;
  tags: string[];
  agentReadiness: Array<{ toolName: string; inputSketch: string; outputShape: string }>;
}

const EMPTY_DRAFT: Draft = {
  linkedRepoIds: [],
  thesis: "",
  problem: "",
  whyNow: "",
  stack: { models: [], apis: [], tools: [], skills: [] },
  tags: [],
  agentReadiness: [],
};

export function IdeaComposer() {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitted, setSubmitted] = useState<{ slug: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Load draft on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Draft;
        setDraft({ ...EMPTY_DRAFT, ...parsed });
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Save on every change.
  useEffect(() => {
    if (submitted) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft, submitted]);

  const canStep2 = draft.linkedRepoIds.length > 0;
  const canStep3 = draft.thesis.length >= 140 && draft.problem.length >= 140;
  const canStep4 = draft.whyNow.length >= 140;
  const canSubmit =
    canStep2 &&
    canStep3 &&
    canStep4 &&
    draft.thesis.length <= 500 &&
    draft.problem.length <= 500 &&
    draft.whyNow.length <= 400;

  const submit = () => {
    if (!canSubmit || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          thesis: draft.thesis,
          problem: draft.problem,
          whyNow: draft.whyNow,
          linkedRepoIds: draft.linkedRepoIds,
          stack: draft.stack,
          tags: draft.tags,
          public: true,
          agentReadiness:
            draft.agentReadiness.length > 0 ? draft.agentReadiness : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Submission failed (HTTP ${res.status})`);
        return;
      }
      const body = (await res.json()) as { idea: { slug: string } };
      localStorage.removeItem(DRAFT_KEY);
      setSubmitted({ slug: body.idea.slug });
    });
  };

  if (submitted) {
    return (
      <div className="rounded-card border border-accent-green/40 bg-accent-green/5 p-5">
        <h2 className="font-semibold text-text-primary">Idea posted.</h2>
        <p className="mt-1 text-sm text-text-secondary">
          You can view it at{" "}
          <Link
            href={`/ideas/${submitted.slug}`}
            className="text-accent-green underline"
          >
            /ideas/{submitted.slug}
          </Link>
          . Share the URL — reactions there stake conviction against your idea.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-primary bg-bg-card p-5 shadow-card">
      <header className="mb-4 flex items-center gap-2">
        <Hammer size={16} className="text-accent-green" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-text-primary">
          Post an idea
        </h2>
        <span className="ml-auto font-mono text-[11px] text-text-tertiary">
          step {step} / 5
        </span>
      </header>

      <StepIndicator step={step} />

      <div className="mt-5">
        {step === 1 && (
          <AnchorStep
            value={draft.linkedRepoIds}
            onChange={(ids) => setDraft((d) => ({ ...d, linkedRepoIds: ids }))}
          />
        )}
        {step === 2 && (
          <ThesisStep
            thesis={draft.thesis}
            problem={draft.problem}
            onChange={(t, p) =>
              setDraft((d) => ({ ...d, thesis: t, problem: p }))
            }
          />
        )}
        {step === 3 && (
          <WhyNowStep
            value={draft.whyNow}
            onChange={(v) => setDraft((d) => ({ ...d, whyNow: v }))}
            anchors={draft.linkedRepoIds}
          />
        )}
        {step === 4 && (
          <StackStep
            stack={draft.stack}
            tags={draft.tags}
            onStack={(s) => setDraft((d) => ({ ...d, stack: s }))}
            onTags={(t) => setDraft((d) => ({ ...d, tags: t }))}
          />
        )}
        {step === 5 && <PreviewStep draft={draft} />}
      </div>

      {error && (
        <p className="mt-3 text-xs text-accent-red">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
          disabled={step === 1 || pending}
          className="rounded-badge px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-bg-secondary disabled:opacity-40"
        >
          Back
        </button>
        <div className="flex gap-2">
          {step < 5 && (
            <button
              type="button"
              onClick={() => setStep((s) => ((s + 1) as Step))}
              disabled={
                (step === 1 && !canStep2) ||
                (step === 2 && !canStep3) ||
                (step === 3 && !canStep4)
              }
              className="rounded-badge bg-bg-secondary border border-border-primary px-3 py-1.5 text-xs font-mono text-text-primary hover:bg-bg-card disabled:opacity-40"
            >
              Next
            </button>
          )}
          {step === 5 && (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || pending}
              className="rounded-badge bg-accent-green/15 border border-accent-green/40 px-3 py-1.5 text-xs font-mono text-accent-green hover:bg-accent-green/25 disabled:opacity-40"
            >
              {pending ? "Posting…" : "Post idea"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-1.5 font-mono text-[10px] text-text-tertiary">
      {["anchor", "thesis", "why-now", "stack", "preview"].map((label, i) => {
        const num = (i + 1) as Step;
        const state =
          num < step ? "done" : num === step ? "current" : "pending";
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-6 rounded-full ${
                state === "done"
                  ? "bg-accent-green"
                  : state === "current"
                    ? "bg-text-primary"
                    : "bg-bg-secondary border border-border-primary"
              }`}
            />
            <span
              className={`uppercase ${state === "current" ? "text-text-secondary" : ""}`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function AnchorStep({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ fullName: string }>>([]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=8`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          repos?: Array<{ fullName: string }>;
        };
        setResults(body.repos ?? []);
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearTimeout(h);
  }, [query]);

  return (
    <div>
      <p className="text-sm text-text-secondary">
        What are you building <em>on</em>? Pick 1–8 repos you&apos;d anchor against.
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. langgraph, trpc, shadcn"
        className="mt-3 w-full rounded-card border border-border-primary bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-border-accent"
      />

      {results.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 rounded-card border border-border-primary bg-bg-secondary p-1">
          {results.map((r) => {
            const picked = value.includes(r.fullName);
            return (
              <li key={r.fullName}>
                <button
                  type="button"
                  disabled={!picked && value.length >= 8}
                  onClick={() => {
                    if (picked) {
                      onChange(value.filter((v) => v !== r.fullName));
                    } else {
                      onChange([...value, r.fullName]);
                    }
                  }}
                  className={`w-full text-left rounded-badge px-2 py-1 font-mono text-xs ${
                    picked
                      ? "bg-accent-green/15 text-accent-green"
                      : "text-text-secondary hover:bg-bg-card"
                  }`}
                >
                  {picked ? "✓ " : "+ "}
                  {r.fullName}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {value.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {value.map((r) => (
            <li
              key={r}
              className="inline-flex items-center gap-1 rounded-badge bg-accent-green/10 px-2 py-0.5 font-mono text-[11px] text-accent-green"
            >
              {r}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== r))}
                aria-label={`Remove ${r}`}
                className="text-accent-green/60 hover:text-accent-green"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThesisStep({
  thesis,
  problem,
  onChange,
}: {
  thesis: string;
  problem: string;
  onChange: (thesis: string, problem: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Thesis"
        helper="One sentence: I want to build X for Y so that Z. 140–500 chars."
        count={thesis.length}
        min={140}
        max={500}
      >
        <textarea
          value={thesis}
          onChange={(e) => onChange(e.target.value, problem)}
          rows={3}
          className="w-full rounded-card border border-border-primary bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-border-accent"
          placeholder="I want to build a drop-in agent debugger for LangGraph devs so that they can step through state without hand-rolling telemetry."
        />
      </Field>
      <Field
        label="Problem"
        helper="Whose pain is this? 140–500 chars."
        count={problem.length}
        min={140}
        max={500}
      >
        <textarea
          value={problem}
          onChange={(e) => onChange(thesis, e.target.value)}
          rows={3}
          className="w-full rounded-card border border-border-primary bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-border-accent"
          placeholder="Engineers shipping LangGraph pipelines have no way to reproduce a live trace locally — they instrument with print statements and grep."
        />
      </Field>
    </div>
  );
}

function WhyNowStep({
  value,
  onChange,
  anchors,
}: {
  value: string;
  onChange: (v: string) => void;
  anchors: string[];
}) {
  return (
    <Field
      label="Why now?"
      helper={
        anchors.length > 0
          ? `Cite the current signal on your anchors (${anchors.slice(0, 2).join(", ")}${anchors.length > 2 ? "…" : ""}). 140–400 chars.`
          : "Cite the current signal you're responding to. 140–400 chars."
      }
      count={value.length}
      min={140}
      max={400}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-card border border-border-primary bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-border-accent"
        placeholder="LangGraph hit a 340% star delta on the 30d window and posted 18 HN threads last week. Every reply asks the same question: 'how do I debug this?'"
      />
    </Field>
  );
}

function StackStep({
  stack,
  tags,
  onStack,
  onTags,
}: {
  stack: IdeaStack;
  tags: string[];
  onStack: (s: IdeaStack) => void;
  onTags: (t: string[]) => void;
}) {
  const groups: Array<{ key: keyof IdeaStack; label: string; placeholder: string }> = [
    { key: "models", label: "Models", placeholder: "claude-opus-4-7, gpt-5" },
    { key: "apis", label: "APIs", placeholder: "stripe, twilio" },
    { key: "tools", label: "Tools", placeholder: "next.js, drizzle" },
    { key: "skills", label: "Skills", placeholder: "auth, payments, realtime" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">
        What does this idea need? Comma-separate items.
      </p>
      {groups.map((g) => (
        <TagInput
          key={g.key}
          label={g.label}
          placeholder={g.placeholder}
          value={stack[g.key]}
          onChange={(next) => onStack({ ...stack, [g.key]: next })}
        />
      ))}
      <TagInput
        label="Tags"
        placeholder="developer-tools, agents, observability"
        value={tags}
        onChange={onTags}
      />
    </div>
  );
}

function TagInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [pending, setPending] = useState("");
  const commit = () => {
    const cleaned = pending
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (cleaned.length === 0) return;
    onChange(Array.from(new Set([...value, ...cleaned])));
    setPending("");
  };
  return (
    <div>
      <label className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        {label}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-1 rounded-card border border-border-primary bg-bg-secondary px-2 py-1.5">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-badge bg-bg-card px-2 py-0.5 font-mono text-[11px] text-text-secondary"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              className="text-text-tertiary hover:text-text-primary"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-32 flex-1 bg-transparent font-mono text-xs text-text-primary outline-none"
        />
      </div>
    </div>
  );
}

function PreviewStep({ draft }: { draft: Draft }) {
  return (
    <div className="rounded-card border border-border-primary bg-bg-secondary p-3">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        Preview
      </p>
      <article className="rounded-card border border-border-primary bg-bg-card p-3">
        <h3 className="font-semibold text-text-primary">{draft.thesis}</h3>
        <p className="mt-2 text-sm text-text-secondary">
          <span className="mr-2 font-mono text-xs uppercase tracking-wide text-text-tertiary">
            why now
          </span>
          {draft.whyNow}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {draft.linkedRepoIds.map((r) => (
            <span
              key={r}
              className="rounded-badge bg-accent-green/10 px-2 py-0.5 font-mono text-[11px] text-accent-green"
            >
              {r}
            </span>
          ))}
        </div>
      </article>
    </div>
  );
}

function Field({
  label,
  helper,
  count,
  min,
  max,
  children,
}: {
  label: string;
  helper: string;
  count: number;
  min: number;
  max: number;
  children: React.ReactNode;
}) {
  const ok = count >= min && count <= max;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
          {label}
        </label>
        <span
          className={`font-mono text-[10px] ${
            ok
              ? "text-accent-green"
              : count > max
                ? "text-accent-red"
                : "text-text-tertiary"
          }`}
        >
          {count} / {max}
        </span>
      </div>
      {children}
      <p className="mt-1 text-[11px] text-text-tertiary">{helper}</p>
    </div>
  );
}
