"use client";

// DropUrlInputCard — paste a GitHub URL, fetch metadata, render preview.
//
// `.url-card` block from `06-drop-repo.html`. Client component because
// it owns the controlled text input + fetch flow. On Fetch:
//   1. Parse the input into `owner/repo` via parseGithubRepo()
//   2. GET /api/repos/<owner>/<name> for metadata
//   3. Surface result to the page via onFetched callback
//   4. Persist last successful slug into localStorage as a draft
//
// Draft key: `trendingrepo-drop-draft`. Shared with DropTagPool +
// DropWhyTextarea so the entire flow resumes after a reload.

import { useCallback, useEffect, useId, useState } from "react";

interface FetchedMetadata {
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  language?: string;
  license?: string;
  stars?: number;
  forks?: number;
  contributors?: number;
  mentions?: number;
  raw?: unknown;
}

interface DropUrlInputCardProps {
  initialValue?: string;
  onFetched?: (metadata: FetchedMetadata) => void;
}

const DRAFT_KEY = "trendingrepo-drop-draft";
const SLUG_RE = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/;

function parseGithubRepo(input: string): { owner: string; name: string } | null {
  const raw = input.trim();
  if (raw.length === 0) return null;

  // full URL
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (u.hostname.endsWith("github.com")) {
      const parts = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "").split("/");
      if (parts.length >= 2 && SLUG_RE.test(`${parts[0]}/${parts[1]}`)) {
        return { owner: parts[0], name: parts[1] };
      }
    }
  } catch {
    // not a URL, fall through to slug-form
  }

  // owner/repo bare
  const m = raw.replace(/\.git$/, "").match(SLUG_RE);
  if (m) return { owner: m[1], name: m[2] };
  return null;
}

function loadDraft(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // ignored
  }
  return null;
}

function saveDraftSlug(slug: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadDraft() ?? {};
    existing.slug = slug;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(existing));
  } catch {
    // ignored — storage quota / disabled cookies
  }
}

export function DropUrlInputCard({ initialValue = "", onFetched }: DropUrlInputCardProps) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const inputId = useId();

  // Hydrate from localStorage draft on mount.
  useEffect(() => {
    const draft = loadDraft();
    if (draft && typeof draft.slug === "string" && value.length === 0) {
      setValue(draft.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFetch = useCallback(async () => {
    const parsed = parseGithubRepo(value);
    if (!parsed) {
      setStatus("error");
      setStatusMessage("paste a github.com/owner/repo URL or owner/repo slug");
      return;
    }
    setStatus("loading");
    setStatusMessage("fetching metadata…");
    const t0 = Date.now();
    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`,
        { headers: { Accept: "application/json" } },
      );
      const ms = Date.now() - t0;
      setLatencyMs(ms);
      if (!res.ok) {
        setStatus("error");
        setStatusMessage(
          res.status === 404
            ? `not found · ${parsed.owner}/${parsed.name}`
            : `fetch failed · ${res.status}`,
        );
        return;
      }
      const body = (await res.json()) as Record<string, unknown>;
      const repoObj = (body.repo ?? {}) as Record<string, unknown>;
      const md: FetchedMetadata = {
        owner: parsed.owner,
        name: parsed.name,
        fullName: `${parsed.owner}/${parsed.name}`,
        description:
          typeof repoObj.description === "string" ? repoObj.description : undefined,
        language: typeof repoObj.language === "string" ? repoObj.language : undefined,
        license: typeof repoObj.license === "string" ? repoObj.license : undefined,
        stars: typeof repoObj.stars === "number" ? repoObj.stars : undefined,
        forks: typeof repoObj.forks === "number" ? repoObj.forks : undefined,
        contributors:
          typeof repoObj.contributors === "number" ? repoObj.contributors : undefined,
        mentions: Array.isArray(body.mentions) ? body.mentions.length : undefined,
        raw: body,
      };
      saveDraftSlug(md.fullName);
      setStatus("ok");
      setStatusMessage(
        `FETCHED · ${ms}ms · ${md.stars ?? "?"} ★ · ${md.language ?? "—"} · ${md.license ?? "—"} · scanning cross-source mentions…`,
      );
      onFetched?.(md);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setStatusMessage(`fetch error · ${message}`);
    }
  }, [value, onFetched]);

  return (
    <div className="url-card">
      <div className="card-title" style={{ marginBottom: 8 }}>
        ▌ <b>Step 2 · Paste a GitHub URL</b> · we auto-fetch the rest
      </div>
      <div className="url-input-wrap">
        <span className="prefix">https://github.com/</span>
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleFetch();
            }
          }}
          placeholder="owner/repo or full URL"
          autoComplete="off"
          spellCheck={false}
          aria-label="GitHub repo URL or owner/repo slug"
        />
        <button
          className="btn primary"
          type="button"
          onClick={() => void handleFetch()}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Fetching…" : "Fetch metadata"}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 8h10m-3-3l3 3-3 3" />
          </svg>
        </button>
      </div>
      {status !== "idle" && (
        <div
          className={`preview-status${status === "loading" ? " loading" : ""}`}
          data-state={status}
          aria-live="polite"
        >
          {status === "ok" && (
            <span className="ok-tick">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 8l3 3 7-7" />
              </svg>
            </span>
          )}
          <span>
            {statusMessage}
            {latencyMs !== null && status === "ok" ? "" : null}
          </span>
        </div>
      )}
    </div>
  );
}
