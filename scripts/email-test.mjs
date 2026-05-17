#!/usr/bin/env node
// scripts/email-test.mjs (S3.5.D)
//
// Operator deliverability probe. Sends a single Resend message and
// surfaces the full response shape so we can diagnose DNS, DMARC, and
// reputation issues without spinning up the whole pipeline.
//
// Usage:
//   node scripts/email-test.mjs --to ops@example.com
//   node scripts/email-test.mjs --to ops@example.com --subject "Probe 2026-05-17"
//
// Required env (mirrors src/lib/email/resend-client.ts):
//   RESEND_API_KEY         — operator-provisioned key
//   RESEND_FROM_EMAIL?     — optional from address; defaults to alerts@alerts.starscreener.dev
//
// Exit codes:
//   0  delivery accepted by Resend (id returned)
//   1  RESEND_API_KEY missing → ask operator to provision
//   2  --to argument missing
//   3  Resend returned a structured error
//   4  fetch / runtime failure (network, DNS, etc.)

import { Resend } from "resend";

function arg(name, fallback = null) {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

const to = arg("--to");
const subject = arg("--subject", `TrendingRepo deliverability probe — ${new Date().toISOString()}`);

if (!to) {
  console.error("[email-test] --to <address> is required");
  process.exit(2);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("[email-test] RESEND_API_KEY is not set in the environment");
  process.exit(1);
}

const from = process.env.RESEND_FROM_EMAIL || "alerts@alerts.starscreener.dev";

const html = `<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;max-width:520px;margin:24px auto;color:#111;">
    <h1 style="font-size:18px;margin:0 0 8px;">TrendingRepo deliverability probe</h1>
    <p style="margin:0 0 12px;">Sent at <code>${new Date().toISOString()}</code> from <code>${from}</code>.</p>
    <p style="margin:0;font-size:13px;color:#555;">If you received this in <b>Inbox</b>, DNS + DMARC are healthy. If it landed in Spam, check SPF/DKIM alignment for the sending domain.</p>
  </body>
</html>`;

const text = [
  "TrendingRepo deliverability probe",
  `Sent at ${new Date().toISOString()} from ${from}.`,
  "",
  "If this lands in Inbox: DNS + DMARC are healthy.",
  "If it lands in Spam: check SPF/DKIM alignment for the sending domain.",
].join("\n");

const resend = new Resend(apiKey);

try {
  const result = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    text,
    headers: {
      "X-Entity-Ref-ID": `email-test-${Date.now()}`,
    },
  });
  if (result.error) {
    console.error(
      "[email-test] Resend returned error:",
      JSON.stringify(result.error, null, 2),
    );
    process.exit(3);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        from,
        to,
        subject,
        resendId: result.data?.id ?? null,
        sentAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (err) {
  console.error(
    "[email-test] runtime failure:",
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(4);
}
