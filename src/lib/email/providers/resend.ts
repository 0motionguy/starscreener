// Resend HTTP provider for the digest cron. Uses raw `fetch` — we
// deliberately avoid pulling the `resend` SDK into this module so we
// don't grow the dependency closure of the cron route. (The breakout
// alert path at `src/lib/email/resend-client.ts` uses the SDK and is
// untouched here.)
//
// API reference:
//   POST https://api.resend.com/emails
//   Authorization: Bearer <RESEND_API_KEY>
//   Content-Type: application/json
//   Body: { from, to, subject, html, text }
//   → 200 { id: "..." }   or   4xx/5xx { message: "..." }

import type { EmailMessage, EmailProvider, EmailSendResult } from "../send";

const RESEND_URL = "https://api.resend.com/emails";

export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error("ResendProvider requires a non-empty apiKey");
    }
    this.apiKey = apiKey.trim();
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    let response: Response;
    try {
      response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `network_error: ${message}` };
    }

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        // ignore — body already unreadable
      }
      return {
        ok: false,
        error: `http_${response.status}: ${errorBody.slice(0, 240)}`,
      };
    }

    // Success body is `{ id: "..." }` — tolerate the shape changing slightly
    // (Resend has added optional fields over time).
    let id: string | undefined;
    try {
      const body = (await response.json()) as unknown;
      if (body && typeof body === "object" && "id" in body) {
        const maybeId = (body as { id: unknown }).id;
        if (typeof maybeId === "string") id = maybeId;
      }
    } catch {
      // Non-JSON success — treat as OK but without an id.
    }
    return { ok: true, id };
  }
}
