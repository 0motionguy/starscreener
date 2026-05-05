// POST /api/cron/digest/weekly
//
// Builds a weekly editorial digest from repo briefs:
//   - Pulls up to 7 briefs written in the last 7 days.
//   - Renders one intro paragraph + linked brief excerpts.
//   - Sends to recipients configured in DIGEST_USER_EMAILS_JSON.
//
// Gate:
//   - DIGEST_ENABLED env: when unset or "false", returns skipped=disabled.
//   - CRON_SECRET bearer auth via verifyCronAuth.
//   - ?dryRun=true renders preview content without sending.

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import {
  getBriefFromFile,
  listRepoBriefRefs,
  type RepoBrief,
} from "@/lib/briefs";
import { getEmailProvider, resolveEmailFrom } from "@/lib/email/send";

export const runtime = "nodejs";

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;
const SITE_URL = "https://trendingrepo.com";
const BRIEF_LIMIT = 7;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isEnabled(): boolean {
  const raw = process.env.DIGEST_ENABLED;
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseDryRun(url: URL): boolean {
  const raw = url.searchParams.get("dryRun");
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

interface BriefDigestEntry {
  owner: string;
  name: string;
  hook: string;
  excerpt: string;
  url: string;
}

interface RenderedBriefDigest {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSentence(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= 240) return compact;
  return `${compact.slice(0, 237).trimEnd()}...`;
}

function firstSentence(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const idx = compact.search(/[.!?](\s|$)/);
  if (idx === -1) return normalizeSentence(compact);
  return normalizeSentence(compact.slice(0, idx + 1));
}

function buildIntro(generatedAt: string, briefCount: number): string {
  const weekLabel = new Date(generatedAt).toISOString().slice(0, 10);
  return `Marco's weekly read for ${weekLabel}: ${briefCount} repos broke through the noise this week because they shipped, attracted attention, or changed buyer behavior faster than incumbents. Scan the list, pick one signal to act on, and open the full brief for source-backed context.`;
}

function parseDigestRecipients(): string[] {
  const raw = process.env.DIGEST_USER_EMAILS_JSON;
  if (!raw || raw.trim().length === 0) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    const out = new Set<string>();
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry !== "string") continue;
        const email = entry.trim();
        if (!email.includes("@")) continue;
        out.add(email);
      }
    } else if (parsed && typeof parsed === "object") {
      for (const value of Object.values(parsed as Record<string, unknown>)) {
        if (typeof value !== "string") continue;
        const email = value.trim();
        if (!email.includes("@")) continue;
        out.add(email);
      }
    }
    return Array.from(out);
  } catch {
    return [];
  }
}

function toBriefEntry(brief: RepoBrief): BriefDigestEntry {
  const fullName = `${brief.owner}/${brief.name}`;
  return {
    owner: brief.owner,
    name: brief.name,
    hook: normalizeSentence(brief.hook),
    excerpt: firstSentence(brief.what || brief.body),
    url: `${SITE_URL}/brief/${brief.owner}/${brief.name}`,
  };
}

async function loadWeeklyBriefEntries(limit = BRIEF_LIMIT): Promise<BriefDigestEntry[]> {
  const refs = listRepoBriefRefs();
  const cutoff = Date.now() - WEEK_MS;

  const recent = refs
    .filter((ref) => {
      const t = Date.parse(ref.writtenAt);
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => Date.parse(b.writtenAt) - Date.parse(a.writtenAt))
    .slice(0, limit);

  const out: BriefDigestEntry[] = [];
  for (const ref of recent) {
    const brief = getBriefFromFile(ref.owner, ref.name);
    if (!brief) continue;
    out.push(toBriefEntry(brief));
  }
  return out;
}

function renderWeeklyBriefDigest(
  entries: BriefDigestEntry[],
  generatedAt: string,
): RenderedBriefDigest {
  const subjectDate = new Date(generatedAt).toISOString().slice(0, 10);
  const subject = `TrendingRepo weekly briefs — ${entries.length} picks (${subjectDate})`;
  const intro = buildIntro(generatedAt, entries.length);

  const rows = entries
    .map(
      (entry, index) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:12px;color:#6b7280;font-family:ui-monospace,Menlo,Consolas,monospace;">#${index + 1} · ${escapeHtml(entry.owner)}/${escapeHtml(entry.name)}</div>
            <div style="font-size:15px;color:#111827;font-weight:700;margin-top:4px;">${escapeHtml(entry.hook)}</div>
            <div style="font-size:13px;color:#374151;line-height:1.5;margin-top:6px;">${escapeHtml(entry.excerpt)}</div>
            <div style="margin-top:8px;"><a href="${entry.url}" style="color:#1d4ed8;text-decoration:none;font-size:13px;">Read full brief →</a></div>
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="font-size:11px;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">TrendingRepo · Weekly Digest</div>
      <h1 style="margin:8px 0 12px 0;font-size:24px;line-height:1.2;">Top repo briefs from the past week</h1>
      <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(intro)}</p>
      <table style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>
      <p style="margin:18px 0 0 0;font-size:12px;color:#64748b;">
        Browse all briefs: <a href="${SITE_URL}/brief" style="color:#1d4ed8;text-decoration:none;">${SITE_URL}/brief</a>
      </p>
    </div>
  </body>
</html>`;

  const text = [
    `TrendingRepo weekly briefs (${subjectDate})`,
    "",
    intro,
    "",
    ...entries.flatMap((entry, index) => [
      `${index + 1}. ${entry.owner}/${entry.name}`,
      entry.hook,
      entry.excerpt,
      entry.url,
      "",
    ]),
    `All briefs: ${SITE_URL}/brief`,
  ].join("\n");

  return { subject, html, text };
}

interface DigestCronResponse {
  ok: true;
  skipped?: "disabled";
  attempted: number;
  sent: number;
  skippedUsers: number;
  errors: Array<{ recipient: string; error: string }>;
  dryRun: boolean;
  durationMs: number;
  preview?: {
    subject: string;
    html: string;
    text: string;
    recipients: string[];
    briefCount: number;
  };
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DigestCronResponse | { ok: false; error: string }>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<{ ok: false; error: string }>;

  if (!isEnabled()) {
    return NextResponse.json(
      {
        ok: true,
        skipped: "disabled",
        attempted: 0,
        sent: 0,
        skippedUsers: 0,
        errors: [],
        dryRun: false,
        durationMs: 0,
      },
      { headers: POST_CACHE_HEADERS },
    );
  }

  const startedAt = Date.now();
  const url = new URL(request.url);
  const dryRun = parseDryRun(url);

  try {
    const recipients = parseDigestRecipients();
    if (recipients.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          attempted: 0,
          sent: 0,
          skippedUsers: 0,
          errors: [],
          dryRun,
          durationMs: Date.now() - startedAt,
        },
        { headers: POST_CACHE_HEADERS },
      );
    }

    const generatedAt = new Date().toISOString();
    const briefEntries = await loadWeeklyBriefEntries(BRIEF_LIMIT);
    if (briefEntries.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          attempted: 0,
          sent: 0,
          skippedUsers: 0,
          errors: [],
          dryRun,
          durationMs: Date.now() - startedAt,
        },
        { headers: POST_CACHE_HEADERS },
      );
    }

    const rendered = renderWeeklyBriefDigest(briefEntries, generatedAt);
    const provider = getEmailProvider();
    const from = resolveEmailFrom();
    const errors: Array<{ recipient: string; error: string }> = [];
    let sent = 0;

    for (const recipient of recipients) {
      if (dryRun) continue;
      const result = await provider.send({
        to: recipient,
        from,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      if (result.ok) {
        sent += 1;
      } else {
        errors.push({ recipient, error: result.error });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        attempted: recipients.length,
        sent: dryRun ? 0 : sent,
        skippedUsers: 0,
        errors,
        dryRun,
        durationMs: Date.now() - startedAt,
        ...(dryRun
          ? {
              preview: {
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
                recipients,
                briefCount: briefEntries.length,
              },
            }
          : {}),
      },
      { headers: POST_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { route: "api:cron:digest:weekly" },
      extra: { dryRun },
    });
    console.error("[api:cron:digest:weekly] failed", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: POST_CACHE_HEADERS },
    );
  }
}

// GET alias for Vercel Cron (which fires GET). Vercel injects the same
// Authorization: Bearer header, so the auth pipeline is identical.
export async function GET(request: NextRequest) {
  return POST(request);
}
