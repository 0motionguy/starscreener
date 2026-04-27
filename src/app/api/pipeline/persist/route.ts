// POST /api/pipeline/persist
//
// Manually flushes every pipeline store to disk as JSONL. Returns the byte
// size of each file so operators can sanity-check that persistence actually
// wrote data. No-op / empty response when persistence is disabled via
// `STARSCREENER_PERSIST=false`.

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { persistPipeline, pipeline } from "@/lib/pipeline/pipeline";
import {
  currentDataDir,
  FILES,
  isPersistenceEnabled,
} from "@/lib/pipeline/storage/file-persistence";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";

export interface PersistResponse {
  ok: true;
  enabled: boolean;
  durationMs: number;
  dataDir: string;
  files: Record<string, number>;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const startedAt = Date.now();
  try {
    const enabled = isPersistenceEnabled();
    if (enabled) {
      // Make sure any in-flight hydration settles first so we don't race
      // against an ensureReady() load that hasn't finished yet.
      await pipeline.ensureReady();
      await persistPipeline();
    }

    const dataDir = currentDataDir();
    const files: Record<string, number> = {};
    for (const filename of Object.values(FILES)) {
      const fullPath = path.join(dataDir, filename);
      try {
        const stat = await fs.stat(fullPath);
        files[filename] = stat.size;
      } catch {
        // File may not exist when persistence is disabled or before a
        // store has ever been written — report 0 bytes rather than erroring.
        files[filename] = 0;
      }
    }

    return NextResponse.json({
      ok: true,
      enabled,
      durationMs: Date.now() - startedAt,
      dataDir,
      files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

// GET alias for Vercel Cron, which fires GET (not POST) to each cron path.
// POST never reads the body, so the GET invocation is semantically identical.
// Vercel auto-injects `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
