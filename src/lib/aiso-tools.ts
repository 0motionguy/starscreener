import { readEnv } from "@/lib/env-helpers";

export type AisoScanStatus = "queued" | "running" | "completed" | "failed";

export interface AisoToolsDimension {
  key: string;
  label: string;
  weight: number;
  score: number;
  status: "pass" | "warn" | "fail";
  issuesCount: number;
  details: Record<string, unknown>;
}

export interface AisoToolsIssue {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  fix: string;
  dimensionKey: string | null;
}

export interface AisoToolsPromptTest {
  engine: string;
  prompt: string;
  cited: boolean;
  position: number;
  brandMentioned: boolean;
  snippet: string | null;
}

export interface AisoToolsScan {
  scanId: string;
  url: string;
  projectName: string | null;
  projectUrl: string | null;
  source: string | null;
  status: AisoScanStatus;
  score: number | null;
  tier: "invisible" | "partial" | "visible" | "cited" | null;
  runtimeVisibility: number | null;
  scanDurationMs: number | null;
  completedAt: string | null;
  resultUrl: string;
  dimensions: AisoToolsDimension[];
  issues: AisoToolsIssue[];
  promptTests: AisoToolsPromptTest[];
}

interface ScanSubmitResponse {
  scanId: string;
  status: AisoScanStatus;
}

interface ScanPayload {
  scanId: string;
  url: string;
  projectName?: string | null;
  projectUrl?: string | null;
  source?: string | null;
  status: AisoScanStatus;
  score: number | null;
  tier: AisoToolsScan["tier"];
  scanDurationMs: number | null;
  completedAt: string | null;
  runtimeVisibility: number | null;
  dimensions: Array<{
    key: string;
    label: string;
    weight?: number;
    score: number;
    status: "pass" | "warn" | "fail";
    details?: Record<string, unknown> | null;
    issues_count?: number;
    issuesCount?: number;
  }>;
  issues: Array<{
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    fix: string;
    dimension_key?: string | null;
    dimensionKey?: string | null;
  }>;
  promptTests?: Array<{
    engine: string;
    prompt: string;
    cited: boolean;
    position: number;
    brandMentioned?: boolean;
    brand_mentioned?: boolean;
    snippet?: string | null;
  }>;
}

const ACTIVE_STATUSES = new Set<AisoScanStatus>(["queued", "running"]);
const COMPLETED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ACTIVE_CACHE_TTL_MS = 90 * 1000;
const FAILED_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_PAGE_WAIT_MS = 14_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

const memoryCache = new Map<
  string,
  { expiresAt: number; value: AisoToolsScan | null }
>();

function normalizeBaseUrl(): string | null {
  if (readEnv("TRENDINGREPO_AISO_AUTO_SCAN", "STARSCREENER_AISO_AUTO_SCAN") === "false") return null;

  const explicit =
    process.env.AISO_API_URL ??
    process.env.AISO_TOOLS_API_URL ??
    process.env.AISOTOOLS_API_URL;

  if (explicit) return explicit.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3033";
  }

  return "https://aiso.tools";
}

function resultPageUrl(baseUrl: string, scanId: string): string {
  return `${baseUrl}/scan/${scanId}`;
}

function cacheTtl(scan: AisoToolsScan | null): number {
  if (!scan) return FAILED_CACHE_TTL_MS;
  if (scan.status === "completed") return COMPLETED_CACHE_TTL_MS;
  if (scan.status === "failed") return FAILED_CACHE_TTL_MS;
  return ACTIVE_CACHE_TTL_MS;
}

function numericEnv(newName: string, oldName: string, fallback: number): number {
  const raw = readEnv(newName, oldName);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function submitScan(
  baseUrl: string,
  targetUrl: string,
): Promise<ScanSubmitResponse | null> {
  return fetchJson<ScanSubmitResponse>(`${baseUrl}/api/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
}

async function fetchScan(
  baseUrl: string,
  scanId: string,
): Promise<ScanPayload | null> {
  return fetchJson<ScanPayload>(`${baseUrl}/api/scan/${scanId}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
}

function normalizeScan(baseUrl: string, payload: ScanPayload): AisoToolsScan {
  return {
    scanId: payload.scanId,
    url: payload.url,
    projectName: payload.projectName ?? null,
    projectUrl: payload.projectUrl ?? null,
    source: payload.source ?? null,
    status: payload.status,
    score: payload.score,
    tier: payload.tier,
    runtimeVisibility: payload.runtimeVisibility,
    scanDurationMs: payload.scanDurationMs,
    completedAt: payload.completedAt,
    resultUrl: resultPageUrl(baseUrl, payload.scanId),
    dimensions: (payload.dimensions ?? []).map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      weight: dimension.weight ?? 0,
      score: dimension.score,
      status: dimension.status,
      issuesCount: dimension.issuesCount ?? dimension.issues_count ?? 0,
      details: dimension.details ?? {},
    })),
    issues: (payload.issues ?? []).map((issue) => ({
      severity: issue.severity,
      title: issue.title,
      fix: issue.fix,
      dimensionKey: issue.dimensionKey ?? issue.dimension_key ?? null,
    })),
    promptTests: (payload.promptTests ?? []).map((test) => ({
      engine: test.engine,
      prompt: test.prompt,
      cited: Boolean(test.cited),
      position: test.position ?? 0,
      brandMentioned: Boolean(test.brandMentioned ?? test.brand_mentioned),
      snippet: test.snippet ?? null,
    })),
  };
}

async function pollScan(
  baseUrl: string,
  scanId: string,
  waitMs: number,
): Promise<AisoToolsScan | null> {
  const deadline = Date.now() + waitMs;
  let last: AisoToolsScan | null = null;

  while (Date.now() <= deadline) {
    const payload = await fetchScan(baseUrl, scanId);
    if (!payload) return last;
    last = normalizeScan(baseUrl, payload);
    if (!ACTIVE_STATUSES.has(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  return last;
}

export async function getAisoToolsScan(
  targetUrl: string | null,
): Promise<AisoToolsScan | null> {
  if (!targetUrl) return null;

  const baseUrl = normalizeBaseUrl();
  if (!baseUrl) return null;

  const cacheKey = `${baseUrl}::${targetUrl}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.value || !ACTIVE_STATUSES.has(cached.value.status)) {
      return cached.value;
    }
    const refreshed = await pollScan(baseUrl, cached.value.scanId, 1);
    if (refreshed) {
      memoryCache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtl(refreshed),
        value: refreshed,
      });
      return refreshed;
    }
    return cached.value;
  }

  const submitted = await submitScan(baseUrl, targetUrl);
  if (!submitted?.scanId) {
    memoryCache.set(cacheKey, {
      expiresAt: Date.now() + FAILED_CACHE_TTL_MS,
      value: null,
    });
    return null;
  }

  const waitMs = numericEnv(
    "TRENDINGREPO_AISO_PAGE_WAIT_MS",
    "STARSCREENER_AISO_PAGE_WAIT_MS",
    DEFAULT_PAGE_WAIT_MS,
  );
  const scan = await pollScan(baseUrl, submitted.scanId, waitMs);
  const value =
    scan ??
    ({
      scanId: submitted.scanId,
      url: targetUrl,
      projectName: null,
      projectUrl: null,
      source: null,
      status: submitted.status,
      score: null,
      tier: null,
      runtimeVisibility: null,
      scanDurationMs: null,
      completedAt: null,
      resultUrl: resultPageUrl(baseUrl, submitted.scanId),
      dimensions: [],
      issues: [],
      promptTests: [],
    } satisfies AisoToolsScan);

  memoryCache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtl(value),
    value,
  });
  return value;
}
