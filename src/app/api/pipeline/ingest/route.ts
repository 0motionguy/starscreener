// POST /api/pipeline/ingest
//
// Ingest one or many GitHub repos into the pipeline. Accepts a JSON body
// listing `owner/repo` full names; optionally kicks off a full recompute
// pass after the batch lands so the UI reflects fresh scores immediately.
//
// Without a GITHUB_TOKEN in the env the route falls back to the mock
// adapter so developers can exercise the pipeline end-to-end offline.

import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import type { IngestBatchResult } from "@/lib/pipeline/types";

const FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_BATCH_SIZE = 50;

export interface IngestRequestBody {
  fullNames: string[];
  useMock?: boolean;
  recomputeAfter?: boolean;
}

export interface IngestResponse {
  ok: true;
  batch: IngestBatchResult;
  recomputed: boolean;
  durationMs: number;
}

export interface IngestErrorResponse {
  ok: false;
  error: string;
  details?: string[];
}

/** Validate and normalize the inbound JSON body. */
function parseBody(raw: unknown): {
  ok: true;
  value: { fullNames: string[]; useMock?: boolean; recomputeAfter?: boolean };
} | { ok: false; error: string; details?: string[] } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  const fullNames = body.fullNames;
  if (!Array.isArray(fullNames)) {
    return { ok: false, error: "fullNames must be an array of strings" };
  }
  if (fullNames.length < 1) {
    return { ok: false, error: "fullNames must contain at least 1 entry" };
  }
  if (fullNames.length > MAX_BATCH_SIZE) {
    return {
      ok: false,
      error: `fullNames must contain at most ${MAX_BATCH_SIZE} entries`,
    };
  }

  const invalid: string[] = [];
  for (const n of fullNames) {
    if (typeof n !== "string" || !FULL_NAME_PATTERN.test(n)) {
      invalid.push(String(n));
    }
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      error: "fullNames contains invalid entries",
      details: invalid.map((n) => `"${n}" is not owner/repo`),
    };
  }

  const useMock =
    body.useMock === undefined ? undefined : Boolean(body.useMock);
  const recomputeAfter =
    body.recomputeAfter === undefined
      ? undefined
      : Boolean(body.recomputeAfter);

  return {
    ok: true,
    value: {
      fullNames: fullNames as string[],
      useMock,
      recomputeAfter,
    },
  };
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IngestResponse | IngestErrorResponse>> {
  const startedAt = Date.now();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, details: parsed.details },
      { status: 400 },
    );
  }

  const { fullNames, useMock, recomputeAfter } = parsed.value;

  try {
    await pipeline.ensureReady();

    const token = process.env.GITHUB_TOKEN;
    const resolvedUseMock = useMock ?? !token;
    const adapter = createGitHubAdapter({
      useMock: resolvedUseMock,
      token,
    });

    const batch = await pipeline.ingestBatch(fullNames, {
      githubAdapter: adapter,
    });

    const shouldRecompute = recomputeAfter ?? true;
    if (shouldRecompute) {
      await pipeline.recomputeAll();
    }

    return NextResponse.json({
      ok: true,
      batch,
      recomputed: shouldRecompute,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export interface IngestUsageResponse {
  endpoint: string;
  methods: string[];
  body: {
    fullNames: string;
    useMock: string;
    recomputeAfter: string;
  };
  example: {
    fullNames: string[];
    useMock: boolean;
    recomputeAfter: boolean;
  };
  limits: {
    minBatchSize: number;
    maxBatchSize: number;
    fullNamePattern: string;
  };
}

export async function GET(): Promise<NextResponse<IngestUsageResponse>> {
  return NextResponse.json({
    endpoint: "/api/pipeline/ingest",
    methods: ["POST"],
    body: {
      fullNames:
        "string[] of owner/repo names (1-50 entries, matches /^[A-Za-z0-9._-]+\\/[A-Za-z0-9._-]+$/)",
      useMock:
        "boolean (optional) — force the mock adapter. Defaults to !process.env.GITHUB_TOKEN.",
      recomputeAfter:
        "boolean (optional, default true) — re-score the whole pipeline after ingestion.",
    },
    example: {
      fullNames: ["vercel/next.js", "ollama/ollama"],
      useMock: false,
      recomputeAfter: true,
    },
    limits: {
      minBatchSize: 1,
      maxBatchSize: MAX_BATCH_SIZE,
      fullNamePattern: FULL_NAME_PATTERN.source,
    },
  });
}
