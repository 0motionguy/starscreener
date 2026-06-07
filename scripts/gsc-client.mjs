#!/usr/bin/env node
// TrendingRepo — Google Search Console client (shared auth + REST helpers).
//
// Auth precedence (first that resolves wins):
//   1. GSC_SERVICE_ACCOUNT_JSON env — raw JSON content of a service-account key.
//      Used by the cron workflow; the SA email must be added to
//      sc-domain:trendingrepo.com as a verified user (Restricted role suffices).
//   2. ADC fallback via `gcloud auth application-default print-access-token`.
//      Used for local-dev convenience; requires `gcloud auth application-
//      default login --scopes=...webmasters.readonly,...cloud-platform` to
//      have been run once. The quota project is read from
//      GSC_QUOTA_PROJECT (default: theta-yen-494902-d2).
//
// Exports:
//   getAccessToken()                          → Promise<string>
//   searchAnalyticsQuery(site, body)          → search analytics call
//   urlInspect(site, url)                     → url inspection result
//   sitemapsList(site)                        → registered sitemaps
//   sitemapGet(site, feedpath)                → single sitemap detail
//
// All callers should treat the returned objects as the GSC API's response
// shape — see https://developers.google.com/webmaster-tools/v1/api_reference_index

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

const SCOPES = "https://www.googleapis.com/auth/webmasters.readonly";
// Write scope — needed for sitemap submit / delete. ADC users must re-run
// `gcloud auth application-default login --scopes=...webmasters,...cloud-platform`
// to grant this; otherwise PUT/DELETE returns 403. Service-account JWTs mint
// this scope on demand without re-auth.
const SCOPES_WRITE = "https://www.googleapis.com/auth/webmasters";
const DEFAULT_QUOTA_PROJECT = "theta-yen-494902-d2";
const BASE = "https://searchconsole.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function quotaProject() {
  return process.env.GSC_QUOTA_PROJECT?.trim() || DEFAULT_QUOTA_PROJECT;
}

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function mintTokenFromServiceAccount(saJsonRaw) {
  let sa;
  try {
    sa = JSON.parse(saJsonRaw);
  } catch (err) {
    throw new Error(
      `GSC_SERVICE_ACCOUNT_JSON is not valid JSON (${err.message})`,
    );
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      "GSC_SERVICE_ACCOUNT_JSON missing client_email or private_key",
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  // SA mints the broader write scope by default — read calls work under it,
  // and sitemap submit/delete need it. The SA principal still requires the
  // matching GSC role ("Full" — not "Restricted") to actually use the write
  // permission, but the token itself is broad enough.
  const claim = {
    iss: sa.client_email,
    scope: SCOPES_WRITE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(sa.private_key));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Service-account token exchange failed (HTTP ${res.status}): ${txt.slice(0, 300)}`);
  }
  const tok = await res.json();
  if (!tok.access_token) {
    throw new Error("Service-account token response missing access_token");
  }
  return {
    token: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in || 3600) * 1000 - 60_000,
  };
}

/**
 * Locate the gcloud invocation that actually works in this environment.
 * Returns `{ command, args }` ready for execFileAsync. On a typical Linux/Mac
 * box this is just `gcloud`. On Windows the GCP SDK ships a `.cmd` wrapper
 * (resolved via PATHEXT) — but the git-bash distribution installs only a
 * POSIX shebang script with no `.cmd` next to it, which Windows-native
 * spawn cannot run. We probe each candidate with `--version` and pick the
 * first that returns 0.
 */
async function findGcloudInvocation() {
  const isWin = process.platform === "win32";

  /** @type {Array<{ command: string, args: string[], label: string }>} */
  const candidates = [];
  if (isWin) {
    candidates.push({ command: "gcloud.cmd", args: [], label: "gcloud.cmd" });
    candidates.push({ command: "gcloud.bat", args: [], label: "gcloud.bat" });
  }
  candidates.push({ command: "gcloud", args: [], label: "gcloud" });
  if (isWin && process.env.USERPROFILE) {
    candidates.push({
      command: `${process.env.USERPROFILE}\\google-cloud-sdk\\bin\\gcloud.cmd`,
      args: [],
      label: "gcloud.cmd (USERPROFILE)",
    });
  }
  // git-bash on Windows: the SDK script has no .cmd shim, but `bash -c gcloud`
  // hits the POSIX wrapper inside the bash PATH. Skip this on POSIX where the
  // plain candidate already works.
  if (isWin) {
    candidates.push({ command: "bash", args: ["-c"], label: "bash -c gcloud" });
  }

  for (const c of candidates) {
    try {
      if (c.args.length === 0) {
        await execFileAsync(c.command, ["--version"], { timeout: 8_000 });
      } else {
        // bash -c needs the gcloud command as a single string argument.
        await execFileAsync(c.command, [...c.args, "gcloud --version"], {
          timeout: 8_000,
        });
      }
      return c;
    } catch {
      // try next
    }
  }
  return null;
}

async function mintTokenFromAdc() {
  const inv = await findGcloudInvocation();
  if (!inv) {
    throw new Error(
      `gcloud binary not found on PATH. Install the Google Cloud SDK or set GSC_SERVICE_ACCOUNT_JSON. ` +
        `If gcloud is installed in a non-default location, add its bin directory to PATH.`,
    );
  }
  const cmdArgs =
    inv.args.length === 0
      ? ["auth", "application-default", "print-access-token"]
      : [...inv.args, "gcloud auth application-default print-access-token"];
  try {
    const { stdout } = await execFileAsync(inv.command, cmdArgs, {
      timeout: 15_000,
    });
    const token = stdout.trim();
    if (!token) throw new Error("gcloud returned empty token");
    // ADC tokens are typically 1h; we don't get expiry from print-access-token,
    // so assume 50min to be safe and re-mint sooner than necessary.
    return { token, expiresAt: Date.now() + 50 * 60_000 };
  } catch (err) {
    throw new Error(
      `ADC fallback failed (${inv.label} auth application-default print-access-token): ${err.message}. ` +
        `Run: gcloud auth application-default login --scopes=${SCOPES},https://www.googleapis.com/auth/cloud-platform`,
    );
  }
}

/**
 * Returns a bearer access token for Google Search Console. Cached in-process
 * until ~1 min before expiry. Mints via SA env first, falls back to ADC.
 */
export async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  const saJson = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  const minted = saJson
    ? await mintTokenFromServiceAccount(saJson)
    : await mintTokenFromAdc();
  cachedToken = minted.token;
  cachedTokenExpiresAt = minted.expiresAt;
  return cachedToken;
}

async function gscFetch(path, init = {}) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-goog-user-project": quotaProject(),
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GSC ${init.method || "GET"} ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  return res.json();
}

/** Encode a property URL (typically `sc-domain:trendingrepo.com`) for paths. */
function encodeSite(site) {
  return encodeURIComponent(site);
}

/**
 * Search Analytics query — returns rows for the given dimensions.
 * @param {string} site e.g. "sc-domain:trendingrepo.com"
 * @param {object} body { startDate, endDate, dimensions, type?, rowLimit?, ... }
 */
export async function searchAnalyticsQuery(site, body) {
  return gscFetch(
    `/webmasters/v3/sites/${encodeSite(site)}/searchAnalytics/query`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * URL Inspection — index status for a single URL within a property.
 * @param {string} site
 * @param {string} url full URL to inspect
 */
export async function urlInspect(site, url) {
  return gscFetch("/v1/urlInspection/index:inspect", {
    method: "POST",
    body: JSON.stringify({ inspectionUrl: url, siteUrl: site }),
  });
}

/** List sitemaps registered for the property. */
export async function sitemapsList(site) {
  return gscFetch(`/webmasters/v3/sites/${encodeSite(site)}/sitemaps`);
}

/** Get a single sitemap's status. */
export async function sitemapGet(site, feedpath) {
  return gscFetch(
    `/webmasters/v3/sites/${encodeSite(site)}/sitemaps/${encodeURIComponent(feedpath)}`,
  );
}

/**
 * Register / re-submit a sitemap to Search Console. Idempotent — submitting
 * an existing feedpath is a no-op other than refreshing the GSC submission
 * timestamp. Requires the `webmasters` write scope (not readonly).
 *
 * ADC users: re-auth with the write scope first:
 *   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters,https://www.googleapis.com/auth/cloud-platform
 *
 * Service-account users: the SA must have the "Full" role on the GSC property
 * (Restricted is read-only and will return 403 on this endpoint).
 *
 * @param {string} site e.g. "sc-domain:trendingrepo.com"
 * @param {string} feedpath Full URL of the sitemap, e.g.
 *   "https://trendingrepo.com/sitemap-compare.xml"
 */
export async function sitemapSubmit(site, feedpath) {
  // Returns no body on success — the API responds 200 with an empty body.
  // gscFetch expects JSON; tolerate the empty body by catching and treating
  // it as a successful no-content response.
  const path = `/webmasters/v3/sites/${encodeSite(site)}/sitemaps/${encodeURIComponent(feedpath)}`;
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": quotaProject(),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new Error(
        `Sitemap submit forbidden (HTTP 403). Likely cause: token lacks the write scope. ` +
          `For ADC, re-auth with: gcloud auth application-default login --scopes=${SCOPES_WRITE},https://www.googleapis.com/auth/cloud-platform . ` +
          `For service accounts, ensure the SA has "Full" role on ${site} in GSC. Raw: ${text.slice(0, 200)}`,
      );
    }
    throw new Error(`Sitemap submit failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return { submitted: true, feedpath };
}

/**
 * Un-register a sitemap from Search Console. Useful for cleaning up
 * mis-registered entries (.well-known/security.txt, empty/dead sitemaps).
 * Same scope + role requirements as sitemapSubmit.
 */
export async function sitemapDelete(site, feedpath) {
  const path = `/webmasters/v3/sites/${encodeSite(site)}/sitemaps/${encodeURIComponent(feedpath)}`;
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": quotaProject(),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new Error(
        `Sitemap delete forbidden (HTTP 403). Likely cause: token lacks the write scope. ` +
          `For ADC, re-auth with: gcloud auth application-default login --scopes=${SCOPES_WRITE},https://www.googleapis.com/auth/cloud-platform . ` +
          `For service accounts, ensure the SA has "Full" role on ${site} in GSC. Raw: ${text.slice(0, 200)}`,
      );
    }
    if (res.status === 404) {
      return { deleted: false, feedpath, reason: "not registered" };
    }
    throw new Error(`Sitemap delete failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return { deleted: true, feedpath };
}

/** Test helper — wipe the cached token so the next call re-mints. */
export function _resetTokenCacheForTests() {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
}
