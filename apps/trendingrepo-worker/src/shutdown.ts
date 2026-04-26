import type http from 'node:http';
import { closeRedis } from './lib/redis.js';
import { flushSentry } from './lib/sentry.js';
import { getLogger } from './lib/log.js';

export interface ShutdownOptions {
  server?: http.Server | undefined;
  onClose?: () => Promise<void>;
  timeoutMs?: number;
}

export function installShutdownHandlers(opts: ShutdownOptions = {}): void {
  const log = getLogger();
  let shuttingDown = false;
  const handler = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'shutdown begin');
    const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
    try {
      if (opts.server) {
        await new Promise<void>((resolve) => opts.server!.close(() => resolve()));
      }
      if (opts.onClose) await opts.onClose();
      await closeRedis();
      await flushSentry(Math.max(500, deadline - Date.now()));
      log.info('shutdown complete');
    } catch (err) {
      log.error({ err: (err as Error).message }, 'shutdown error');
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}
