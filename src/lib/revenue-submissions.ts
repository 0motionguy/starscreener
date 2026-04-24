// Revenue submission intake.
//
// Two submission modes:
//  - "trustmrr_link": founder enters their existing TrustMRR slug. Validated
//                     against the cached catalog. Approval attaches a
//                     verified_trustmrr-tier overlay (if not already present)
//                     keyed by the repo fullName.
//  - "self_report":   founder self-reports MRR/customers/provider + a proof
//                     URL. Approval attaches a self_reported-tier overlay.
//                     Visually distinct card on the repo detail page.
//
// Stored in .data/revenue-submissions.jsonl — DELIBERATELY separate from
// .data/repo-submissions.jsonl (the existing repo intake) because:
//  - different schema
//  - different lifecycle (moderation-gated, not auto-ingested)
//  - different readers (admin queue, not the trending pipeline)
// Folding these into the repo intake would force every existing reader of
// listRepoSubmissions() to learn a second schema.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  mutateJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";
import { normalizeRepoReference } from "@/lib/repo-submissions";
import { normalizeTrustmrrSlug } from "@/lib/trustmrr-url";

export const REVENUE_SUBMISSIONS_FILE = "revenue-submissions.jsonl";

const MAX_PROOF_URL_LENGTH = 300;
const MAX_NOTES_LENGTH = 400;
const MAX_CONTACT_LENGTH = 160;
const MAX_MRR_CENTS = 10_000_000_00; // $10M/mo. If a founder is really at
// this scale and posting into a web form, they can email us instead.
const MAX_CUSTOMERS = 10_000_000;

const ALLOWED_PROVIDERS = new Set([
  "stripe",
  "lemonsqueezy",
  "polar",
  "paddle",
  "dodopayment",
  "revenuecat",
  "superwall",
  "creem",
  "other",
]);

export type RevenueSubmissionMode = "trustmrr_link" | "self_report";

export type RevenueSubmissionStatus =
  | "pending_moderation"
  | "approved"
  | "rejected";

export interface RevenueSubmissionBase {
  id: string;
  fullName: string;
  normalizedFullName: string;
  repoUrl: string;
  mode: RevenueSubmissionMode;
  status: RevenueSubmissionStatus;
  contact: string | null;
  notes: string | null;
  source: "web";
  submittedAt: string;
  moderatedAt?: string | null;
  moderationNote?: string | null;
}

export interface TrustMrrLinkSubmission extends RevenueSubmissionBase {
  mode: "trustmrr_link";
  trustmrrSlug: string;
}

export interface SelfReportSubmission extends RevenueSubmissionBase {
  mode: "self_report";
  mrrCents: number;
  customers: number | null;
  paymentProvider: string; // one of ALLOWED_PROVIDERS
  proofUrl: string | null;
}

export type RevenueSubmissionRecord =
  | TrustMrrLinkSubmission
  | SelfReportSubmission;

export interface PublicRevenueSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  mode: RevenueSubmissionMode;
  status: RevenueSubmissionStatus;
  submittedAt: string;
  moderatedAt: string | null;
  // mode-specific preview fields — only safe-to-expose
  trustmrrSlug?: string;
  mrrCents?: number;
  paymentProvider?: string;
}

export type RevenueSubmissionInput =
  | {
      mode: "trustmrr_link";
      repo: string;
      trustmrrSlug: string;
      contact?: string | null;
      notes?: string | null;
    }
  | {
      mode: "self_report";
      repo: string;
      mrrCents: number;
      customers?: number | null;
      paymentProvider: string;
      proofUrl?: string | null;
      contact?: string | null;
      notes?: string | null;
    };

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeSlug(raw: string): string | null {
  return normalizeTrustmrrSlug(raw);
}

function validateProofUrl(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("proofUrl must be a valid URL");
  }
  const normalized = parsed.toString();
  if (normalized.length > MAX_PROOF_URL_LENGTH) {
    throw new Error(`proofUrl must be <= ${MAX_PROOF_URL_LENGTH} characters`);
  }
  return normalized;
}

export function validateRevenueSubmissionInput(
  raw: unknown,
): { ok: true; value: RevenueSubmissionInput } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;
  if (body.mode !== "trustmrr_link" && body.mode !== "self_report") {
    return { ok: false, error: "mode must be 'trustmrr_link' or 'self_report'" };
  }
  if (typeof body.repo !== "string" || !body.repo.trim()) {
    return { ok: false, error: "repo is required" };
  }

  const contactRaw = typeof body.contact === "string" ? body.contact : "";
  const contact = normalizeWhitespace(contactRaw);
  if (contact.length > MAX_CONTACT_LENGTH) {
    return {
      ok: false,
      error: `contact must be <= ${MAX_CONTACT_LENGTH} characters`,
    };
  }

  const notesRaw = typeof body.notes === "string" ? body.notes : "";
  const notes = normalizeMultiline(notesRaw);
  if (notes.length > MAX_NOTES_LENGTH) {
    return {
      ok: false,
      error: `notes must be <= ${MAX_NOTES_LENGTH} characters`,
    };
  }

  if (body.mode === "trustmrr_link") {
    if (typeof body.trustmrrSlug !== "string") {
      return { ok: false, error: "trustmrrSlug is required" };
    }
    const slug = normalizeSlug(body.trustmrrSlug);
    if (!slug) {
      return {
        ok: false,
        error:
          "verified-profile slug must be a valid slug or a full profile URL",
      };
    }
    return {
      ok: true,
      value: {
        mode: "trustmrr_link",
        repo: body.repo,
        trustmrrSlug: slug,
        contact: contact || null,
        notes: notes || null,
      },
    };
  }

  // self_report
  const mrrCentsRaw = body.mrrCents ?? body.mrrDollars;
  let mrrCents: number | null = null;
  if (typeof mrrCentsRaw === "number" && Number.isFinite(mrrCentsRaw)) {
    mrrCents = Math.round(mrrCentsRaw);
  } else if (typeof mrrCentsRaw === "string") {
    const parsed = Number.parseFloat(mrrCentsRaw.replace(/[,$]/g, ""));
    if (Number.isFinite(parsed)) {
      mrrCents = Math.round(
        // Heuristic: if the field is called mrrDollars, convert. Otherwise
        // assume the caller sent cents. Our form will always send cents.
        "mrrDollars" in body ? parsed * 100 : parsed,
      );
    }
  }
  if (mrrCents === null || mrrCents < 0) {
    return { ok: false, error: "mrrCents must be a non-negative number" };
  }
  if (mrrCents > MAX_MRR_CENTS) {
    return {
      ok: false,
      error: `mrrCents must be <= ${MAX_MRR_CENTS}; email hello@trendingrepo.com for larger`,
    };
  }

  let customers: number | null = null;
  if (body.customers !== undefined && body.customers !== null) {
    const raw = typeof body.customers === "string"
      ? Number.parseInt(body.customers.replace(/[,\s]/g, ""), 10)
      : body.customers;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return { ok: false, error: "customers must be a non-negative number" };
    }
    if (raw > MAX_CUSTOMERS) {
      return { ok: false, error: `customers must be <= ${MAX_CUSTOMERS}` };
    }
    customers = Math.round(raw);
  }

  const providerRaw =
    typeof body.paymentProvider === "string"
      ? body.paymentProvider.trim().toLowerCase()
      : "";
  if (!providerRaw) {
    return { ok: false, error: "paymentProvider is required" };
  }
  if (!ALLOWED_PROVIDERS.has(providerRaw)) {
    return {
      ok: false,
      error: `paymentProvider must be one of: ${Array.from(ALLOWED_PROVIDERS).join(", ")}`,
    };
  }

  let proofUrl: string | null = null;
  if (typeof body.proofUrl === "string" && body.proofUrl.trim()) {
    try {
      proofUrl = validateProofUrl(body.proofUrl);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    ok: true,
    value: {
      mode: "self_report",
      repo: body.repo,
      mrrCents,
      customers,
      paymentProvider: providerRaw,
      proofUrl,
      contact: contact || null,
      notes: notes || null,
    },
  };
}

/**
 * Validate that a TrustMRR slug exists in the cached catalog (written by
 * scripts/sync-trustmrr.mjs to data/trustmrr-startups.json). Returns true
 * if the slug is present or the catalog is absent — we don't want to block
 * submission just because the catalog cache hasn't been primed yet in a
 * fresh environment.
 */
export function trustmrrSlugExists(slug: string): boolean {
  const path = resolve(process.cwd(), "data", "trustmrr-startups.json");
  if (!existsSync(path)) return true;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as {
      startups?: Array<{ slug?: string }>;
    };
    const startups = Array.isArray(parsed.startups) ? parsed.startups : [];
    return startups.some((s) => s && s.slug === slug);
  } catch {
    return true;
  }
}

export function toPublicRevenueSubmission(
  record: RevenueSubmissionRecord,
): PublicRevenueSubmission {
  const base: PublicRevenueSubmission = {
    id: record.id,
    fullName: record.fullName,
    repoUrl: record.repoUrl,
    mode: record.mode,
    status: record.status,
    submittedAt: record.submittedAt,
    moderatedAt: record.moderatedAt ?? null,
  };
  if (record.mode === "trustmrr_link") {
    base.trustmrrSlug = record.trustmrrSlug;
  } else {
    base.mrrCents = record.mrrCents;
    base.paymentProvider = record.paymentProvider;
  }
  return base;
}

export async function listRevenueSubmissions(): Promise<
  RevenueSubmissionRecord[]
> {
  const records = await readJsonlFile<RevenueSubmissionRecord>(
    REVENUE_SUBMISSIONS_FILE,
  );
  return records.sort(
    (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
  );
}

export async function getRevenueSubmissionById(
  id: string,
): Promise<RevenueSubmissionRecord | null> {
  const records = await listRevenueSubmissions();
  return records.find((record) => record.id === id) ?? null;
}

export async function updateRevenueSubmissionStatus(
  id: string,
  next: { status: RevenueSubmissionStatus; moderationNote?: string | null },
): Promise<RevenueSubmissionRecord> {
  let updated: RevenueSubmissionRecord | null = null;
  // Serialize with submitRevenueToQueue() on the same file so a submit landing
  // during an approve/reject cannot be silently overwritten by the rewrite.
  await mutateJsonlFile<RevenueSubmissionRecord>(
    REVENUE_SUBMISSIONS_FILE,
    (records) => {
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) {
        throw new Error(`revenue submission not found: ${id}`);
      }
      const current = records[index] as RevenueSubmissionRecord;
      updated = {
        ...current,
        status: next.status,
        moderatedAt: new Date().toISOString(),
        moderationNote: next.moderationNote ?? null,
      } as RevenueSubmissionRecord;
      const replaced = [...records];
      replaced[index] = updated;
      replaced.sort(
        (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt),
      );
      return replaced;
    },
  );
  if (!updated) {
    throw new Error(`revenue submission not found: ${id}`);
  }
  return updated;
}

export type RevenueSubmissionResult =
  | { kind: "created"; submission: PublicRevenueSubmission }
  | { kind: "duplicate"; submission: PublicRevenueSubmission };

export async function submitRevenueToQueue(
  input: RevenueSubmissionInput,
): Promise<RevenueSubmissionResult> {
  const normalized = normalizeRepoReference(input.repo);
  if (!normalized) {
    throw new Error(
      "repo must be a GitHub repo URL or owner/name, for example vercel/next.js",
    );
  }

  if (input.mode === "trustmrr_link" && !trustmrrSlugExists(input.trustmrrSlug)) {
    throw new Error(
      `Verified-profile slug '${input.trustmrrSlug}' was not found in the cached catalog. Double-check the slug, or wait for the next catalog sync.`,
    );
  }

  // One transactional read-modify-write: duplicate check + append happen
  // under a per-file lock so two same-repo submits can't both pass the check
  // and both append, and a concurrent moderation rewrite can't drop the new
  // row between our append and its rewrite.
  let result: RevenueSubmissionResult | null = null;
  await mutateJsonlFile<RevenueSubmissionRecord>(
    REVENUE_SUBMISSIONS_FILE,
    (existing) => {
      const duplicate = existing.find(
        (record) =>
          record.normalizedFullName === normalized.normalizedFullName &&
          record.status !== "rejected",
      );
      if (duplicate) {
        result = {
          kind: "duplicate",
          submission: toPublicRevenueSubmission(duplicate),
        };
        return existing;
      }

      const submittedAt = new Date().toISOString();
      const common: RevenueSubmissionBase = {
        id: randomUUID(),
        fullName: normalized.fullName,
        normalizedFullName: normalized.normalizedFullName,
        repoUrl: normalized.repoUrl,
        mode: input.mode,
        status: "pending_moderation",
        contact: input.contact ?? null,
        notes: input.notes ?? null,
        source: "web",
        submittedAt,
        moderatedAt: null,
        moderationNote: null,
      };

      const record: RevenueSubmissionRecord =
        input.mode === "trustmrr_link"
          ? { ...common, mode: "trustmrr_link", trustmrrSlug: input.trustmrrSlug }
          : {
              ...common,
              mode: "self_report",
              mrrCents: input.mrrCents,
              customers: input.customers ?? null,
              paymentProvider: input.paymentProvider,
              proofUrl: input.proofUrl ?? null,
            };

      result = { kind: "created", submission: toPublicRevenueSubmission(record) };
      return [...existing, record];
    },
  );

  if (!result) {
    // Defensive — mutator always sets result before returning.
    throw new Error("revenue submission transaction did not produce a result");
  }
  return result;
}
