"use client";

// DropWhyTextarea — step 4 controlled textarea + char counter + tip
// footer. Persists to localStorage on each keystroke; the submit
// button reads the same draft key.
//
// MAX_REASON_LENGTH (600) is the server-side cap; we show a soft
// warning at 540 and hard-stop at 600.

import { useEffect, useMemo, useState } from "react";

const DRAFT_KEY = "trendingrepo-drop-draft";
const MAX_LEN = 600;
const SOFT_LIMIT = 540;

function persistWhy(value: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    existing.whyNow = value;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(existing));
  } catch {
    // ignored
  }
}

function loadDraftWhy(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).whyNow === "string") {
      return (parsed as Record<string, unknown>).whyNow as string;
    }
  } catch {
    // ignored
  }
  return "";
}

interface DropWhyTextareaProps {
  initialValue?: string;
}

export function DropWhyTextarea({ initialValue = "" }: DropWhyTextareaProps) {
  const [value, setValue] = useState<string>(initialValue);

  // Hydrate from draft.
  useEffect(() => {
    if (initialValue.length === 0) {
      const draft = loadDraftWhy();
      if (draft.length > 0) setValue(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on each change (debounce not needed for this size).
  useEffect(() => {
    persistWhy(value);
  }, [value]);

  const chars = value.length;
  const remaining = MAX_LEN - chars;
  const specific = useMemo(() => {
    if (chars < 60) return { label: "too short", className: "" };
    const wordy = value.toLowerCase();
    const vague = /\b(awesome|amazing|incredible|cool|nice|great|super)\b/.test(wordy);
    if (vague) return { label: "vague (avoid 'awesome')", className: "" };
    return { label: "specific (good)", className: "up-text" };
  }, [value, chars]);

  return (
    <div className="card" style={{ marginTop: 14 }} data-component="drop-why">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Step 4 · Why is this worth surfacing?</b> · specific is 2× better
        </h2>
      </div>
      <div style={{ padding: 14 }}>
        <textarea
          name="whyNow"
          className="why-input"
          value={value}
          onChange={(e) => {
            const v = e.target.value.slice(0, MAX_LEN);
            setValue(v);
          }}
          placeholder="One paragraph. What does it do, who's it for, what's the differentiated angle? Avoid 'awesome' / 'amazing' — give us a concrete reason it deserves the slot…"
          aria-label="Why this repo deserves to be surfaced"
          maxLength={MAX_LEN}
        />
      </div>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--graphite)",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div
          className="row gap-2"
          style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-muted)" }}
        >
          <span className={chars > SOFT_LIMIT ? "warn-text" : "up-text"}>
            ● {chars} chars · {remaining} left
          </span>
          <span className="divider v"></span>
          <span className={specific.className}>● {specific.label}</span>
          <span className="divider v"></span>
          <span>
            Avg review time: <b className="up-text">14h</b>
          </span>
        </div>
      </div>
    </div>
  );
}
