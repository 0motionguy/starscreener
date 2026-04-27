import * as Sentry from '@sentry/node';
import { loadEnv } from './env.js';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const env = loadEnv();
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
  });
  initialized = true;
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeoutMs);
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
