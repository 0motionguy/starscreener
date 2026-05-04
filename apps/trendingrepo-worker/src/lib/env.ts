import { z } from 'zod';

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
    FIRECRAWL_API_KEY: z.string().optional(),
    FIRECRAWL_API_KEYS: z.string().optional(),
    PULSEMCP_API_KEY: z.string().optional(),
    PULSEMCP_TENANT_ID: z.string().optional(),
    SMITHERY_API_KEY: z.string().optional(),
    GLAMA_API_KEY: z.string().optional(),
    TRUSTMRR_API_KEY: z.string().optional(),
    APIFY_API_TOKEN: z.string().optional(),
    APIFY_PROXY_GROUPS: z.string().optional(),
    APIFY_PROXY_COUNTRY: z.string().optional(),
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

    // LLM telemetry layer (model-usage intelligence v1).
    //   LLM_PROVIDER          — 'kimi' (default, direct Kimi) or 'openrouter'.
    //   OPENROUTER_API_KEY    — required when LLM_PROVIDER=openrouter.
    //   OPENROUTER_REFERER    — sent as HTTP-Referer for OpenRouter app attribution.
    //   LLM_USER_HASH_SALT    — server-side salt for pseudonymizing user_id in events.
    LLM_PROVIDER: z.enum(['kimi', 'openrouter']).optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_REFERER: z.string().url().optional(),
    LLM_USER_HASH_SALT: z.string().optional(),

    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    DATA_STORE_DISABLE: z.string().optional(),
  })
  .refine(
    (env) => {
      const hasIoRedis = Boolean(env.REDIS_URL);
      const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
      return !(hasIoRedis && hasUpstash);
    },
    { message: 'Set REDIS_URL OR UPSTASH_REDIS_REST_URL+TOKEN, never both.' },
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
    throw new Error(`Invalid worker environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof WorkerEnv>(key: K): NonNullable<WorkerEnv[K]> {
  const env = loadEnv();
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Required env ${String(key)} is not set`);
  }
  return value as NonNullable<WorkerEnv[K]>;
}
