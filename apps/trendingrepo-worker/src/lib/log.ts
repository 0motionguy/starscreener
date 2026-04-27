import pino from 'pino';
import { loadEnv } from './env.js';
import * as Sentry from '@sentry/node';

let cached: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (cached !== null) return cached;
  const env = loadEnv();
  cached = pino({
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'trendingrepo-worker', node_env: env.NODE_ENV },
    hooks: {
      logMethod(args, method, level) {
        if (level >= 40) {
          const [first] = args;
          const message = typeof first === 'string' ? first : JSON.stringify(first);
          try {
            Sentry.addBreadcrumb({
              category: 'log',
              level: level >= 50 ? 'error' : 'warning',
              message: message.slice(0, 500),
            });
          } catch {
            /* Sentry not initialized yet */
          }
        }
        return method.apply(this, args);
      },
    },
  });
  return cached;
}
