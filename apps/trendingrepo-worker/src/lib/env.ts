import { z } from 'zod';

const envSchema = z
  .object({
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE: z.string().min(20).optional(),

    REDIS_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    GH_PAT: z.string().optional(),
    HF_TOKEN: z.string().optional(),
    PRODUCTHUNT_TOKEN: z.string().optional(),
    BLUESKY_HANDLE: z.string().optional(),
    BLUESKY_APP_PASSWORD: z.string().optional(),
    FIRECRAWL_API_KEY: z.string().optional(),
    PULSEMCP_API_KEY: z.string().optional(),
    SMITHERY_API_KEY: z.string().optional(),

    SENTRY_DSN: z.string().url().optional(),
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
  const parsed = envSchema.safeParse(process.env);
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
