// /you/alerts — Watchlist Alerts management page.
//
// Server component. Authenticated via `requireUser()` (redirects to Clerk
// sign-in when anonymous). Pre-loads the caller's alert rules + profile
// email-preference snapshot directly from Drizzle so the first paint is
// immediate; client islands then call `/api/me/*` for mutations.
//
// We hit the DB directly (instead of HTTP self-calling `/api/me/alert-rules`)
// because the server component is already authenticated — paying serialization
// + a network hop for `requireUser()` again would be wasteful.

import type { Metadata } from "next";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  alertRules,
  type AlertCadence,
  type AlertRuleType,
} from "@/lib/db/schema/alerts";
import { requireUser } from "@/lib/auth/server";

import { AlertRuleList } from "./_components/AlertRuleList";
import { AddAlertRuleDialog } from "./_components/AddAlertRuleDialog";
import { GlobalPreferences } from "./_components/GlobalPreferences";
import type {
  SerializedAlertRule,
  SerializedProfilePrefs,
} from "./_components/types";

// Drizzle DB query — must render at request time. Without DATABASE_URL
// set, prerender throws from db/client.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watchlist alerts — TrendingRepo",
  description:
    "Manage email + webhook alerts for your watched repos. Choose rule types, cadences, and quiet hours.",
  robots: { index: false, follow: false },
};

// `cookies()` is read inside `requireUser()` which already opts the route
// into dynamic rendering; no need for `export const dynamic`.

export default async function YouAlertsPage() {
  const { profile } = await requireUser();

  // Pull caller's rules — newest first. We surface every rule the user owns,
  // active or paused; the list component renders an active toggle per row.
  const rows = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.profileId, profile.id))
    .orderBy(desc(alertRules.createdAt));

  // Serialize Drizzle row shape → JSON-safe shape for client islands.
  // Date fields become ISO strings; jsonb passes through unchanged.
  // ruleType/cadence are stored as `text` in the schema (not pg-enum) so
  // Drizzle's inferred type is `string`; we narrow back to the enum at the
  // serialization boundary — Lane 1's POST handler validates against the
  // same enums on insert, so any deviation is a writer-side bug.
  const serializedRules: SerializedAlertRule[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    ruleType: r.ruleType as AlertRuleType,
    ruleConfig: r.ruleConfig as Record<string, unknown>,
    cadence: r.cadence as AlertCadence,
    webhookUrl: r.webhookUrl,
    quietHours: r.quietHours as
      | { startMin: number; endMin: number }
      | null,
    active: r.active,
    lastFiredAt: r.lastFiredAt ? r.lastFiredAt.toISOString() : null,
    fireCountToday: r.fireCountToday,
    fireCountTotal: r.fireCountTotal,
    createdAt: r.createdAt.toISOString(),
  }));

  const prefs: SerializedProfilePrefs = {
    emailAlertsCadence: profile.emailAlertsCadence,
    quietHours: profile.quietHours as
      | { startMin: number; endMin: number }
      | null,
    timezone: profile.timezone,
    emailReferralUpdates: profile.emailReferralUpdates,
    emailProductUpdates: profile.emailProductUpdates,
    emailSystem: profile.emailSystem,
  };

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6 md:py-8">
        <header
          className="mb-6 pb-4"
          style={{ borderBottom: "1px solid var(--v3-line-200)" }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {"// 02 · YOU · WATCHLIST · ALERTS"}
          </span>
          <h1
            className="mt-2"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v3-ink-000)",
              lineHeight: 1.1,
            }}
          >
            Watchlist Alerts
          </h1>
          <p
            className="mt-2 max-w-2xl text-sm"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Tell us when something on your watchlist breaks out, hits a rank,
            ships a release, or gets unusual mention volume. Delivery via email
            or webhook — and your saved rules show up in the{" "}
            <code style={{ color: "var(--v3-ink-200)" }}>list_my_alerts</code>{" "}
            MCP tool too.
          </p>
        </header>

        <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              className="font-mono text-[12px] uppercase tracking-[0.18em]"
              style={{ color: "var(--v3-ink-200)" }}
            >
              {"// YOUR RULES"}
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--v3-ink-400)" }}>
              {serializedRules.length} of 25
            </p>
          </div>
          <AddAlertRuleDialog
            existingRuleCount={serializedRules.length}
            defaultTimezone={prefs.timezone}
          />
        </section>

        <AlertRuleList initialRules={serializedRules} />

        <section
          className="mt-10 rounded-[2px]"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div
            className="px-3 py-2"
            style={{
              background: "var(--v3-bg-025)",
              borderBottom: "1px solid var(--v3-line-100)",
            }}
          >
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--v3-ink-300)" }}
            >
              {"// GLOBAL PREFERENCES"}
            </span>
          </div>
          <GlobalPreferences initialPrefs={prefs} />
        </section>
      </div>
    </main>
  );
}
