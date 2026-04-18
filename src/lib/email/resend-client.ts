// StarScreener — Resend client wrapper (P0.1)
//
// Thin wrapper around the Resend SDK. Gated on RESEND_API_KEY env —
// when not set, every send is a no-op that logs to stdout. That lets
// local dev run the full pipeline without accidentally emailing
// operators, and it lets production deployments ship alert rules
// safely before DNS propagation completes on alerts.starscreener.dev.
//
// Callers should prefer `sendAlertEmail` over hitting the SDK directly —
// it centralizes the guard + observability logging.

import { Resend } from "resend";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Tagged as `X-Entity-Ref-ID` for deliverability grouping. Not a dedup key. */
  referenceId?: string;
}

export interface SendEmailResult {
  status: "sent" | "skipped_no_api_key" | "skipped_no_to" | "error";
  resendId?: string;
  error?: string;
}

/**
 * Send an email via Resend. Returns a structured result — never throws
 * on remote failure so the caller doesn't need try/catch at every site.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "alerts@alerts.starscreener.dev";

  if (!apiKey) {
    console.log(
      JSON.stringify({
        scope: "email:send",
        status: "skipped_no_api_key",
        subject: input.subject,
        referenceId: input.referenceId,
      }),
    );
    return { status: "skipped_no_api_key" };
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  if (recipients.length === 0) {
    return { status: "skipped_no_to" };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.referenceId
        ? { "X-Entity-Ref-ID": input.referenceId }
        : undefined,
    });

    if (result.error) {
      console.error(
        JSON.stringify({
          scope: "email:send",
          status: "error",
          subject: input.subject,
          error: result.error.message,
        }),
      );
      return { status: "error", error: result.error.message };
    }

    console.log(
      JSON.stringify({
        scope: "email:send",
        status: "sent",
        resendId: result.data?.id,
        subject: input.subject,
        recipientCount: recipients.length,
        referenceId: input.referenceId,
      }),
    );
    return { status: "sent", resendId: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        scope: "email:send",
        status: "error",
        subject: input.subject,
        error: message,
      }),
    );
    return { status: "error", error: message };
  }
}

/** True if Resend is configured; used by callers that want to skip work early. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
