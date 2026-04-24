// Pluggable email sender for StarScreener weekly digest (and future
// programmatic sends). Deliberately narrow surface — the existing
// `resend-client.ts` + `deliver.ts` path for breakout alerts is
// untouched; this module exists so the digest cron can pick between
// Resend (production) and the dev-safe ConsoleProvider (local) at
// runtime without pulling the Resend SDK into code paths that don't
// need it.
//
// Design notes:
//   - No new dependencies. ResendProvider uses raw `fetch` against the
//     public Resend HTTP API, which matches the contract in
//     https://resend.com/docs/api-reference/emails/send-email.
//   - Selection is env-driven: `RESEND_API_KEY` set → Resend; otherwise
//     ConsoleProvider. The cron route layers on top of this with a
//     `DIGEST_ENABLED` gate and a `?dryRun=true` override — so this
//     module itself is always safe to call.
//   - Providers never throw on remote failure; they return a structured
//     result so the cron can aggregate `errors[]` without try/catch at
//     every send site.
//
// See also:
//   - src/lib/email/providers/resend.ts
//   - src/lib/email/providers/console.ts
//   - src/app/api/cron/digest/weekly/route.ts

import { ConsoleProvider } from "./providers/console";
import { ResendProvider } from "./providers/resend";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailSendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Resolve the active email provider. Picks Resend when `RESEND_API_KEY`
 * is set in the environment, otherwise falls back to `ConsoleProvider`
 * (dev-safe: logs the rendered email to stdout, never sends).
 *
 * Kept as a factory (not a singleton) so tests can set / clear env and
 * get a fresh provider without module-cache gymnastics.
 */
export function getEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    return new ResendProvider(apiKey);
  }
  return new ConsoleProvider();
}

/**
 * Resolve the `From` address for digest emails. Falls back to a safe
 * default that will almost-certainly fail deliverability checks — the
 * fallback exists so dev/test flows don't need the env, but production
 * operators MUST set `EMAIL_FROM` to a verified sender.
 */
export function resolveEmailFrom(): string {
  const configured = process.env.EMAIL_FROM?.trim();
  if (configured && configured.length > 0) return configured;
  return "TrendingRepo Digest <digest@localhost>";
}
