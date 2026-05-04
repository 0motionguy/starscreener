// /api/oembed
//
// oEmbed 1.0 endpoint for /repo/[owner]/[name] URLs.
//
// Why this exists: Slack / Discord / Twitter / Mastodon / LinkedIn unfurl link
// previews by hitting an oEmbed endpoint declared either via:
//   - <link rel="alternate" type="application/json+oembed" href="..."> on the
//     source page (per-page discovery), OR
//   - direct query against /api/oembed?url=https://trendingrepo.com/repo/foo/bar
//
// Closes the AISO audit's agent-readiness gap (see .audit/2026-05-03/REPORT.md).
//
// Spec reference: https://oembed.com/  — minimal "rich" type response.
//
// We deliberately keep this stateless: parse owner/name from the query URL,
// build a card from the same SITE_NAME / SITE_URL constants used everywhere.
// No DB / Redis call — keeps it edge-fast and cache-friendly. If we want
// per-repo star counts later, swap in getRepoBySlug() and lift to nodejs runtime.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { errorEnvelope } from "@/lib/api/error-response";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const runtime = "edge";
// 24h edge cache + SWR — repo cards don't change minute-to-minute, and
// chat platforms hammer this endpoint.
export const revalidate = 86400;

interface OEmbedRich {
  version: "1.0";
  type: "rich";
  title: string;
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  html: string;
  width: number;
  height: number;
  cache_age: string;
}

function parseRepoUrl(raw: string | null): { owner: string; name: string } | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  // Accept SITE_URL host or relative path; reject everything else (closes
  // SSRF-shaped abuse where a caller crafts ?url=https://attacker/...).
  const siteHost = (() => {
    try {
      return new URL(SITE_URL).host.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (siteHost && parsed.host.toLowerCase() !== siteHost) return null;
  const m = parsed.pathname.match(/^\/repo\/([^/]+)\/([^/]+)\/?$/);
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}

export function GET(request: NextRequest): NextResponse {
  const url = request.nextUrl.searchParams.get("url");
  const format = request.nextUrl.searchParams.get("format") ?? "json";

  // XML format is in the spec but we don't ship it — return 501 cleanly so
  // callers fall back to JSON instead of getting a malformed body.
  if (format !== "json") {
    return NextResponse.json(
      errorEnvelope("Only json format is supported", "UNSUPPORTED_FORMAT"),
      { status: 501 },
    );
  }

  const repo = parseRepoUrl(url);
  if (!repo) {
    return NextResponse.json(
      errorEnvelope(
        "Invalid or unsupported url. Expected https://<site>/repo/<owner>/<name>",
        "UNSUPPORTED_URL",
      ),
      { status: 404 },
    );
  }

  const fullName = `${repo.owner}/${repo.name}`;
  const repoUrl = `${SITE_URL.replace(/\/+$/, "")}/repo/${repo.owner}/${repo.name}`;
  const ghAvatar = `https://avatars.githubusercontent.com/${repo.owner}?s=80&v=4`;

  const body: OEmbedRich = {
    version: "1.0",
    type: "rich",
    title: `${fullName} — ${SITE_NAME}`,
    author_name: repo.owner,
    author_url: `https://github.com/${repo.owner}`,
    provider_name: SITE_NAME,
    provider_url: SITE_URL,
    thumbnail_url: ghAvatar,
    thumbnail_width: 80,
    thumbnail_height: 80,
    html: `<iframe src="${repoUrl}" width="600" height="280" frameborder="0" loading="lazy" sandbox="allow-scripts allow-same-origin" title="${fullName} on ${SITE_NAME}"></iframe>`,
    width: 600,
    height: 280,
    cache_age: "86400",
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
      // Per oEmbed spec, both content-types are valid. Pick the json one.
      "Content-Type": "application/json+oembed; charset=utf-8",
    },
  });
}
