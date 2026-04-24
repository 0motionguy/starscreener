// Dev-safe email provider — logs the rendered email instead of sending.
//
// Used whenever `RESEND_API_KEY` is unset, which is the default in local
// dev and test. The log is a single structured JSON line so CI can
// assert on it without fragile substring matching.
//
// Intentionally does NOT log the full HTML body (can be many KB and
// wrecks dev consoles). Callers that need to inspect the HTML during
// iteration can dump it to a file via the digest unit tests, which
// snapshot the rendered output.

import type { EmailMessage, EmailProvider, EmailSendResult } from "../send";

export class ConsoleProvider implements EmailProvider {
  readonly name = "console";

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    // In production we NEVER want to log recipient emails (privacy). The
    // ConsoleProvider is only active when RESEND_API_KEY is unset, which
    // should never be the production config — but guard anyway so a
    // misconfigured prod deploy fails closed on leakage, not on deliv.
    const isProd = process.env.NODE_ENV === "production";
    const payload = {
      scope: "email:console",
      status: "logged" as const,
      provider: this.name,
      subject: msg.subject,
      from: msg.from,
      to: isProd ? "[redacted]" : msg.to,
      htmlBytes: msg.html.length,
      textBytes: msg.text.length,
      textPreview: msg.text.slice(0, 160),
    };
    // Use console.log (not .info) so it shows up under the default Next.js
    // log level. JSON.stringify keeps the line structured for log-shipping.
    console.log(JSON.stringify(payload));
    return { ok: true, id: `console-${Date.now()}` };
  }
}
