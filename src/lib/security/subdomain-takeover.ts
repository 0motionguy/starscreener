import * as Sentry from "@sentry/nextjs";
import { Resolver } from "node:dns/promises";

import {
  OpsAlertFatalError,
  OpsAlertRecoverableError,
  SubdomainTakeoverFatalError,
  SubdomainTakeoverQuarantineError,
  engineErrorSentryContext,
} from "@/lib/errors";
import { getTrustedOpsAlertWebhookUrl } from "@/lib/security/trusted-url";

export interface TakeoverScanTarget {
  host: string;
  expectedProvider?: string;
}

export interface TakeoverFinding {
  host: string;
  provider: string;
  reason: "host_unresolvable" | "dangling_cname";
  cname: string | null;
  detail: string;
}

export interface TakeoverScanResult {
  checkedAt: string;
  checkedTargets: number;
  findings: TakeoverFinding[];
}

const DEFAULT_PROVIDER = "unknown";

let sentryCaptureException = Sentry.captureException;
let sentryCaptureMessage = Sentry.captureMessage;

function parseTargetList(raw: string | undefined): TakeoverScanTarget[] {
  if (!raw?.trim()) {
    throw new SubdomainTakeoverFatalError(
      "subdomain takeover scan blocked: SUBDOMAIN_TAKEOVER_TARGETS_JSON missing",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SubdomainTakeoverFatalError("invalid SUBDOMAIN_TAKEOVER_TARGETS_JSON", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new SubdomainTakeoverFatalError(
      "SUBDOMAIN_TAKEOVER_TARGETS_JSON must be a non-empty array",
    );
  }

  const targets: TakeoverScanTarget[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const host = typeof (entry as { host?: unknown }).host === "string"
      ? (entry as { host: string }).host.trim().toLowerCase()
      : "";
    if (!host) continue;
    const expectedProvider =
      typeof (entry as { expectedProvider?: unknown }).expectedProvider === "string"
        ? (entry as { expectedProvider: string }).expectedProvider.trim()
        : undefined;
    targets.push({ host, expectedProvider });
  }

  if (targets.length === 0) {
    throw new SubdomainTakeoverFatalError(
      "SUBDOMAIN_TAKEOVER_TARGETS_JSON contains no valid host entries",
    );
  }

  return targets;
}

export async function runSubdomainTakeoverScan(): Promise<TakeoverScanResult> {
  const resolver = new Resolver();
  const targets = parseTargetList(process.env.SUBDOMAIN_TAKEOVER_TARGETS_JSON);
  const findings: TakeoverFinding[] = [];

  for (const target of targets) {
    try {
      const cnames = await resolver.resolveCname(target.host);
      const cname = cnames[0]?.toLowerCase() ?? null;
      if (cname) {
        try {
          await resolver.resolveAny(cname);
        } catch (error) {
          const code = (error as { code?: string } | null)?.code ?? "UNKNOWN";
          if (code === "ENOTFOUND" || code === "ENODATA" || code === "SERVFAIL") {
            findings.push({
              host: target.host,
              provider: target.expectedProvider ?? DEFAULT_PROVIDER,
              reason: "dangling_cname",
              cname,
              detail: `CNAME target lookup failed: ${code}`,
            });
          }
        }
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code ?? "UNKNOWN";
      if (code === "ENOTFOUND" || code === "ENODATA" || code === "SERVFAIL") {
        findings.push({
          host: target.host,
          provider: target.expectedProvider ?? DEFAULT_PROVIDER,
          reason: "host_unresolvable",
          cname: null,
          detail: `Host lookup failed: ${code}`,
        });
      } else {
        const wrapped = new SubdomainTakeoverFatalError(
          "subdomain takeover scan failed during DNS lookup",
          {
            host: target.host,
            code,
            message: error instanceof Error ? error.message : String(error),
          },
        );
        const sentryContext = engineErrorSentryContext(wrapped, {
          route: "api/cron/subdomain-takeover",
        });
        sentryCaptureException(wrapped, {
          tags: sentryContext.tags,
          extra: sentryContext.extra,
        });
        throw wrapped;
      }
    }
  }

  if (findings.length > 0) {
    const issue = new SubdomainTakeoverQuarantineError(
      "subdomain takeover scan found suspicious host(s)",
      {
        findingCount: findings.length,
      },
    );
    const sentryContext = engineErrorSentryContext(issue, {
      route: "api/cron/subdomain-takeover",
    });
    sentryCaptureMessage("subdomain takeover finding", {
      level: "warning",
      tags: sentryContext.tags,
      extra: {
        ...sentryContext.extra,
        findings,
      },
    });
    await alertOps("subdomain-takeover-findings", {
      findingCount: findings.length,
      findings,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    checkedTargets: targets.length,
    findings,
  };
}

async function alertOps(event: string, metadata: Record<string, unknown>): Promise<void> {
  const configured = process.env.OPS_ALERT_WEBHOOK;
  const url = getTrustedOpsAlertWebhookUrl(configured);
  if (!url) {
    const blocked = new OpsAlertFatalError(
      "ops alert blocked: OPS_ALERT_WEBHOOK missing or untrusted",
      {
        event,
        source: "subdomain-takeover",
        metadata,
        configured: configured ? "present" : "missing",
      },
    );
    const sentryContext = engineErrorSentryContext(blocked, {
      route: "api/cron/subdomain-takeover",
      alert: "ops-alert-blocked",
    });
    sentryCaptureException(blocked, {
      tags: sentryContext.tags,
      extra: sentryContext.extra,
    });
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "subdomain-takeover",
        event,
        at: new Date().toISOString(),
        metadata,
      }),
    });
    if (!response.ok) {
      throw new OpsAlertRecoverableError("OPS alert webhook delivery failed", {
        event,
        source: "subdomain-takeover",
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    const failed = error instanceof OpsAlertRecoverableError
      ? error
      : new OpsAlertRecoverableError("OPS alert webhook delivery failed", {
        event,
        source: "subdomain-takeover",
        message: error instanceof Error ? error.message : String(error),
      });
    const sentryContext = engineErrorSentryContext(failed, {
      route: "api/cron/subdomain-takeover",
      alert: "ops-alert-delivery-failed",
    });
    sentryCaptureException(failed, {
      tags: sentryContext.tags,
      extra: sentryContext.extra,
    });
  }
}

export function _setSubdomainTakeoverSentryForTests(deps: {
  captureException: typeof Sentry.captureException;
  captureMessage: typeof Sentry.captureMessage;
}): void {
  sentryCaptureException = deps.captureException;
  sentryCaptureMessage = deps.captureMessage;
}

export function _resetSubdomainTakeoverSentryForTests(): void {
  sentryCaptureException = Sentry.captureException;
  sentryCaptureMessage = Sentry.captureMessage;
}

export async function _alertOpsForTests(
  event: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await alertOps(event, metadata);
}
