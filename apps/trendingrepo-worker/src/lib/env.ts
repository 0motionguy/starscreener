import { z } from 'zod';

import { FatalConfigError } from './errors.js';

const envSchema = z
  .object({
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE: z.string().min(20).optional(),

    REDIS_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    GH_PAT: z.string().optional(),
    GITHUB_TOKEN: z.string().optional(),
    GH_TOKEN_POOL: z.string().optional(),
    GITHUB_TOKEN_POOL: z.string().optional(),
    HF_TOKEN: z.string().optional(),
    PRODUCTHUNT_TOKEN: z.string().optional(),
    PRODUCTHUNT_TOKENS: z.string().optional(),
    DEVTO_API_KEY: z.string().optional(),
    DEVTO_API_KEYS: z.string().optional(),
    BLUESKY_HANDLE: z.string().optional(),
    BLUESKY_APP_PASSWORD: z.string().optional(),
    PULSEMCP_API_KEY: z.string().optional(),
    PULSEMCP_TENANT_ID: z.string().optional(),
    SMITHERY_API_KEY: z.string().optional(),
    GLAMA_API_KEY: z.string().optional(),
    TRUSTMRR_API_KEY: z.string().optional(),
    // Artificial Analysis benchmark API (https://artificialanalysis.ai/documentation).
    // Free tier 1k req/day; fetcher schedules at 6h cadence (4 calls/day).
    // The artificialanalysis fetcher gracefully short-circuits when this is
    // unset — see apps/trendingrepo-worker/src/fetchers/artificialanalysis/.
    AA_API_KEY: z.string().optional(),
    APIFY_API_TOKEN: z.string().optional(),
    APIFY_PROXY_GROUPS: z.string().optional(),
    APIFY_PROXY_COUNTRY: z.string().optional(),
    // Reddit OAuth (script-type app at https://www.reddit.com/prefs/apps).
    // All three are .optional() so the worker boots without them; the
    // reddit fetcher checks REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET at
    // run-time and skips with a warning if either is missing (it does NOT
    // fall back to the public r/.../new.json endpoint — see fetcher header).
    // REDDIT_USER_AGENT defaults to `trendingrepo-worker/0.1` when unset;
    // Reddit requires a non-default UA per their API rules.
    // REDDIT_USER_AGENTS is the legacy rotation pool consumed by
    // lib/sources/reddit.ts (still used by the reddit-baselines fetcher).
    REDDIT_CLIENT_ID: z.string().optional(),
    REDDIT_CLIENT_SECRET: z.string().optional(),
    REDDIT_USER_AGENT: z.string().optional(),
    REDDIT_USER_AGENTS: z.string().optional(),

    // Worker tunables (numeric values are validated in the consuming fetcher,
    // not here — keeping this layer string-typed avoids zod coercion surprises
    // when an env var is "" or has trailing whitespace).
    NPM_SEARCH_SIZE: z.string().optional(),
    NPM_CANDIDATE_LIMIT: z.string().optional(),
    NPM_TOP_LIMIT: z.string().optional(),
    NPM_SEARCH_DELAY_MS: z.string().optional(),
    NPM_DOWNLOAD_RANGE_DELAY_MS: z.string().optional(),
    NPM_DOWNLOAD_LAG_DAYS: z.string().optional(),
    NPM_DISCOVERY_QUERIES: z.string().optional(),
    NPM_DOWNLOAD_END_DATE: z.string().optional(),
    PROFILE_ENRICH_LIMIT: z.string().optional(),
    REPO_METADATA_BATCH_SIZE: z.string().optional(),

    // Tier 2 producer config (manual-repos + revenue-manual-matches read
    // operator-curated JSON from raw.githubusercontent — these override the
    // default 0motionguy/starscreener@main path).
    MANUAL_DATA_SOURCE_REPO: z.string().optional(),
    MANUAL_DATA_SOURCE_BRANCH: z.string().optional(),

    SENTRY_DSN: z.string().url().optional(),

    KIMI_API_KEY: z.string().optional(),
    KIMI_BASE_URL: z.string().url().optional(),
    KIMI_MODEL: z.string().optional(),

    // OpenRouter / LLM-router config consumed by `lib/llm/*`. All optional;
    // the LLM modules short-circuit when OPENROUTER_API_KEY is missing.
    // Pre-2026-05-07 these were referenced via `env.X` but never declared
    // in the schema, which left tsc red on every `npm run typecheck` run.
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_REFERER: z.string().optional(),
    OPENROUTER_MODEL: z.string().optional(),
    LLM_PROVIDER: z.enum(['kimi', 'openrouter', 'nanogpt']).optional(),
    // Optional secondary provider. When the primary call fails with a
    // retryable error (auth/quota 401·403, rate-limit 429, 5xx, timeout) the
    // router transparently retries here. Unset = no fallback (prior behavior).
    LLM_FALLBACK_PROVIDER: z.enum(['kimi', 'openrouter', 'nanogpt']).optional(),
    // NanoGPT — OpenAI-compatible (https://nano-gpt.com/api/v1). The active
    // subscription covers a curated model set at zero per-token cost;
    // NANOGPT_MODEL must be one of those (verify via
    // GET /api/subscription/v1/models). Wired as the Kimi fallback so consensus
    // verdicts keep generating while Kimi-for-coding billing is restored.
    NANOGPT_API_KEY: z.string().optional(),
    NANOGPT_BASE_URL: z.string().url().optional(),
    NANOGPT_MODEL: z.string().optional(),
    LLM_USER_HASH_SALT: z.string().optional(),

    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    DATA_STORE_DISABLE: z.string().optional(),
    DATA_STORE_REQUIRE_REDIS: z.string().optional(),

    // DORP intake-drain fetcher needs to call back to the web app to
    // run the existing pipeline ingest. Both are optional — when unset the
    // fetcher logs a warning and skips its tick rather than crashing the
    // worker process.
    CRON_SECRET: z.string().optional(),
    TRENDINGREPO_BASE_URL: z.string().url().optional(),
  })
  .refine(
    (env) => {
      const hasIoRedis = Boolean(env.REDIS_URL);
      const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN);
      return !(hasIoRedis && hasUpstash);
    },
    { message: 'Set REDIS_URL OR UPSTASH_REDIS_REST_URL+TOKEN, never both.' },
  )
  .refine(
    (env) => !env.UPSTASH_REDIS_REST_URL || Boolean(env.UPSTASH_REDIS_REST_TOKEN),
    { message: 'UPSTASH_REDIS_REST_URL requires UPSTASH_REDIS_REST_TOKEN.' },
  )
  .refine(
    (env) => env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN,
    { message: 'UPSTASH_REDIS_REST_TOKEN was set without UPSTASH_REDIS_REST_URL.' },
  )
  .refine(
    (env) => {
      const requireRedis =
        env.DATA_STORE_REQUIRE_REDIS === '1' ||
        env.DATA_STORE_REQUIRE_REDIS?.toLowerCase() === 'true';
      const hasRedis =
        Boolean(env.REDIS_URL) ||
        Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
      return !requireRedis || hasRedis || env.DATA_STORE_DISABLE === '1' || env.DATA_STORE_DISABLE === 'true';
    },
    { message: 'DATA_STORE_REQUIRE_REDIS=1 requires REDIS_URL or UPSTASH_REDIS_REST_URL+TOKEN.' },
  );

export type WorkerEnv = z.infer<typeof envSchema>;

let cached: WorkerEnv | null = null;

export function loadEnv(): WorkerEnv {
  if (cached !== null) return cached;
  // Treat empty-string env values as missing. .env.local files commonly
  // ship with `KEY=` placeholders that bash `source` and Node `--env-file`
  // both load as empty strings - zod's .url()/.min() reject those even
  // with .optional(), since optional() means "or undefined", not "or empty".
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    cleaned[k] = v === '' ? undefined : v;
  }
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new FatalConfigError(`Invalid worker environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof WorkerEnv>(key: K): NonNullable<WorkerEnv[K]> {
  const env = loadEnv();
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new FatalConfigError(`Required env ${String(key)} is not set`, { key: String(key) });
  }
  return value as NonNullable<WorkerEnv[K]>;
}
