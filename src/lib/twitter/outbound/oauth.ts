// OAuth2 refresh-token rotation for the X (Twitter) API v2.
//
// X user-context access tokens expire (~2h), which is why a statically
// provisioned TWITTER_OAUTH2_USER_TOKEN goes dead shortly after setup
// and every cron run afterwards 401s. This manager keeps posting alive
// indefinitely: it exchanges a refresh token for a fresh access token
// before each expiry window.
//
// Rotation caveat that shapes the design: X invalidates the used
// refresh token on every exchange and returns a NEW one. The rotated
// token must therefore be persisted immediately — losing it means the
// operator has to re-authorize the app and re-seed the env var. State
// rides the existing JSONL file-persistence layer (same as the
// outbound audit trail): append-only rows, latest row wins on boot,
// `TWITTER_OAUTH2_REFRESH_TOKEN` env seed used only when no persisted
// row exists yet.

import { FatalConfigError, TransientHttpError } from "@/lib/errors";
import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

import type { OutboundTokenProvider } from "./types";

export const OAUTH_STATE_FILE = "twitter-oauth-state.jsonl";

const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

/** Refresh this long before recorded expiry so a slow thread never
 * straddles the cliff mid-post. */
const EXPIRY_SAFETY_MS = 5 * 60 * 1000;

/** X returns expires_in=7200 today; assume that when the field is absent. */
const DEFAULT_EXPIRES_IN_SEC = 7200;

export interface TwitterOAuthState {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp the access token stops working. */
  expiresAt: string;
  /** ISO timestamp this row was written — latest row wins on boot. */
  rotatedAt: string;
}

export interface TwitterOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Initial refresh token from the one-time authorize flow. Only used
   * until the first rotation lands in the state file. */
  seedRefreshToken: string;
  /** Override for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export function readTwitterOAuthConfigFromEnv(): TwitterOAuthConfig | null {
  const clientId = process.env.TWITTER_OAUTH2_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITTER_OAUTH2_CLIENT_SECRET?.trim();
  const seedRefreshToken = process.env.TWITTER_OAUTH2_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !seedRefreshToken) return null;
  return { clientId, clientSecret, seedRefreshToken };
}

interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export class TwitterOAuthTokenManager implements OutboundTokenProvider {
  private state: TwitterOAuthState | null = null;
  private stateLoaded = false;
  private inflight: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: TwitterOAuthConfig) {
    if (!config.clientId || !config.clientSecret || !config.seedRefreshToken) {
      throw new FatalConfigError(
        "TwitterOAuthTokenManager: clientId, clientSecret and seedRefreshToken are all required",
      );
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async getAccessToken(): Promise<string> {
    await this.loadPersistedState();
    const state = this.state;
    if (
      state &&
      Date.parse(state.expiresAt) - EXPIRY_SAFETY_MS > Date.now()
    ) {
      return state.accessToken;
    }
    return this.refresh();
  }

  async invalidateAndRefresh(): Promise<string> {
    await this.loadPersistedState();
    // Drop the cached access token but keep the refresh token — that's
    // the credential the retry needs.
    if (this.state) {
      this.state = { ...this.state, expiresAt: new Date(0).toISOString() };
    }
    return this.refresh();
  }

  private async loadPersistedState(): Promise<void> {
    if (this.stateLoaded) return;
    this.stateLoaded = true;
    try {
      const rows = await readJsonlFile<TwitterOAuthState>(OAUTH_STATE_FILE);
      const latest = rows
        .filter((r) => r.accessToken && r.refreshToken && r.rotatedAt)
        .sort((a, b) => Date.parse(b.rotatedAt) - Date.parse(a.rotatedAt))[0];
      if (latest) this.state = latest;
    } catch {
      // Fresh container / missing file — the env seed covers first run.
    }
  }

  /** Single-flight: concurrent callers share one token exchange, since a
   * second exchange with the same refresh token would be rejected. */
  private refresh(): Promise<string> {
    if (!this.inflight) {
      this.inflight = this.exchangeRefreshToken().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async exchangeRefreshToken(): Promise<string> {
    const refreshToken =
      this.state?.refreshToken ?? this.config.seedRefreshToken;
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");

    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      // 400 invalid_request here almost always means the refresh token
      // was consumed elsewhere (or the seed is stale after a container
      // rebuild that lost the state file) — the operator must re-run
      // the authorize flow and update TWITTER_OAUTH2_REFRESH_TOKEN.
      throw new TransientHttpError(
        `Twitter OAuth2 token refresh failed with ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    const payload = (await res.json()) as TokenEndpointResponse;
    if (!payload.access_token) {
      throw new TransientHttpError(
        `Twitter OAuth2 token endpoint returned no access_token: ${JSON.stringify(payload).slice(0, 200)}`,
        0,
      );
    }

    const now = Date.now();
    const expiresInSec =
      typeof payload.expires_in === "number" && payload.expires_in > 0
        ? payload.expires_in
        : DEFAULT_EXPIRES_IN_SEC;
    const next: TwitterOAuthState = {
      accessToken: payload.access_token,
      // X rotates the refresh token on every exchange; if it ever
      // doesn't, the old one is still valid so keep using it.
      refreshToken: payload.refresh_token ?? refreshToken,
      expiresAt: new Date(now + expiresInSec * 1000).toISOString(),
      rotatedAt: new Date(now).toISOString(),
    };
    this.state = next;

    try {
      await appendJsonlFile(OAUTH_STATE_FILE, next);
    } catch (err) {
      // Don't fail the post over a persistence hiccup — but shout,
      // because losing a rotated refresh token strands the account on
      // the next container boot until the operator re-seeds.
      console.error(
        "[twitter:oauth] failed to persist rotated refresh token — " +
          "re-authorization will be needed after the next restart",
        err,
      );
    }
    return next.accessToken;
  }
}

// One shared manager per process so every cron invocation in a
// container sees the same rotation state (two managers would race each
// other's refresh tokens).
let shared: { key: string; manager: TwitterOAuthTokenManager } | null = null;

export function getSharedTwitterOAuthManager(): TwitterOAuthTokenManager | null {
  const config = readTwitterOAuthConfigFromEnv();
  if (!config) return null;
  const key = `${config.clientId}:${config.seedRefreshToken}`;
  if (!shared || shared.key !== key) {
    shared = { key, manager: new TwitterOAuthTokenManager(config) };
  }
  return shared.manager;
}

/** Test hook — clears the process-wide manager singleton. */
export function _resetSharedTwitterOAuthManagerForTests(): void {
  shared = null;
}
