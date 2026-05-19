"use client";

// DropSubmitButton — final-step submit. Reads the form draft from
// localStorage, projects display category/tags to closed-set enums,
// POSTs /api/repo-submissions, then redirects to /account?tab=drops
// on success. Anonymous users are routed to /sign-in first because the
// rate-limit budget is tighter for unauthenticated POSTs.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DROP_DISPLAY_CATEGORIES,
  type DropDisplayCategoryId,
  displayCategoryToEnum,
  displayTagsToEnumTags,
} from "@/lib/drop/steps";

const DRAFT_KEY = "trendingrepo-drop-draft";

interface DropDraft {
  slug?: string;
  cat?: DropDisplayCategoryId | null;
  tags?: string[];
  whyNow?: string;
}

interface SubmitResponse {
  ok: boolean;
  error?: string;
  result?: { kind: "created" | "duplicate" | "already_tracked" };
}

function readDraft(): DropDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as DropDraft;
  } catch {
    // ignored
  }
  return {};
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignored
  }
}

interface DropSubmitButtonProps {
  signedIn: boolean;
}

export function DropSubmitButton({ signedIn }: DropSubmitButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DropDraft>({});

  useEffect(() => {
    setDraft(readDraft());
    const handler = () => setDraft(readDraft());
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    }
  }, []);

  const slug = draft.slug ?? null;
  const ready = useMemo(() => {
    if (!slug) return false;
    if (!draft.whyNow || draft.whyNow.trim().length < 20) return false;
    return true;
  }, [slug, draft.whyNow]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!signedIn) {
      router.push("/sign-in?redirectUrl=/drop?step=4");
      return;
    }
    const latest = readDraft();
    if (!latest.slug) {
      setError("paste a GitHub URL on step 2 first");
      return;
    }
    if (!latest.whyNow || latest.whyNow.trim().length < 20) {
      setError("step 4: write a one-paragraph 'why' (≥20 chars)");
      return;
    }
    const catEnum = DROP_DISPLAY_CATEGORIES.find((c) => c.id === latest.cat)
      ? displayCategoryToEnum(latest.cat as DropDisplayCategoryId)
      : null;
    const tagEnum = displayTagsToEnumTags(latest.tags ?? []);
    setSubmitting(true);
    try {
      const res = await fetch("/api/repo-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: latest.slug,
          whyNow: latest.whyNow.trim(),
          category: catEnum,
          tags: tagEnum,
        }),
      });
      const body = (await res.json()) as SubmitResponse;
      if (!res.ok || !body.ok) {
        setError(body.error ?? `submit failed · ${res.status}`);
        return;
      }
      clearDraft();
      router.push("/account?tab=drops");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`submit error · ${message}`);
    } finally {
      setSubmitting(false);
    }
  }, [router, signedIn]);

  return (
    <div className="row gap-2" data-component="drop-submit">
      {error ? (
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--down)",
            padding: "2px 6px",
            border: "1px solid var(--down)",
            borderRadius: "var(--r-pill)",
          }}
          role="alert"
        >
          {error}
        </span>
      ) : null}
      <button
        className="btn ghost"
        type="button"
        onClick={() => {
          clearDraft();
          router.replace("/drop?step=2");
        }}
      >
        Reset draft
      </button>
      <button
        className="btn primary lg"
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || !ready}
        aria-busy={submitting}
      >
        {submitting ? "Submitting…" : signedIn ? "Submit for review" : "Sign in & submit"}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 8h10m-3-3l3 3-3 3" />
        </svg>
      </button>
    </div>
  );
}
