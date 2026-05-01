// /alerts — V4 W10 (UI phase) — alerts inbox + trigger management.
//
// MVP / Phase 1: seed data only. Backend (Redis storage + worker job
// at apps/trendingrepo-worker/src/fetchers/alerts) ships in W10 phase 2.
// The page renders today via static seed events + rules so the route is
// live, the V4 chrome is wired, and the user can navigate from the
// sidebar AlertBadge to a real surface.

import type { Metadata } from "next";
import Link from "next/link";

import { AlertInbox } from "@/components/alerts/AlertInbox";
import { AlertTriggerCard } from "@/components/alerts/AlertTriggerCard";
import type { AlertEvent, AlertRule } from "@/lib/pipeline/types";

// V4 (CORPUS) primitives.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Alerts — TrendingRepo",
  description:
    "Per-repo alert rules + the inbox of recent firings. Toggle alerts from /watchlist or any repo detail page.",
  alternates: { canonical: "/alerts" },
};

// ---------------------------------------------------------------------------
// Seed data — demo until the worker writes real events to Redis.
// ---------------------------------------------------------------------------

const NOW = Date.now();
const HOURS = 3_600_000;
const DAYS = 24 * HOURS;

const SEED_RULES: AlertRule[] = [
  {
    id: "rule-claude",
    userId: "local",
    repoId: "anthropic/claude-code",
    categoryId: null,
    trigger: "star_spike",
    threshold: 500,
    cooldownMinutes: 60,
    enabled: true,
    createdAt: new Date(NOW - 14 * DAYS).toISOString(),
    lastFiredAt: new Date(NOW - 4 * HOURS).toISOString(),
  },
  {
    id: "rule-skills",
    userId: "local",
    repoId: "anthropics/skills",
    categoryId: null,
    trigger: "rank_jump",
    threshold: 10,
    cooldownMinutes: 120,
    enabled: true,
    createdAt: new Date(NOW - 7 * DAYS).toISOString(),
    lastFiredAt: new Date(NOW - 1 * DAYS).toISOString(),
  },
  {
    id: "rule-mcp",
    userId: "local",
    repoId: null,
    categoryId: "mcp",
    trigger: "breakout_detected",
    threshold: 1,
    cooldownMinutes: 30,
    enabled: true,
    createdAt: new Date(NOW - 30 * DAYS).toISOString(),
    lastFiredAt: new Date(NOW - 2 * HOURS).toISOString(),
  },
  {
    id: "rule-digest",
    userId: "local",
    repoId: null,
    categoryId: null,
    trigger: "daily_digest",
    threshold: 0,
    cooldownMinutes: 1440,
    enabled: false,
    createdAt: new Date(NOW - 60 * DAYS).toISOString(),
    lastFiredAt: null,
  },
];

const SEED_EVENTS: AlertEvent[] = [
  {
    id: "evt-1",
    ruleId: "rule-claude",
    repoId: "anthropic/claude-code",
    userId: "local",
    trigger: "star_spike",
    title: "+824 stars in 24h",
    body: "anthropic/claude-code crossed your 500-star threshold.",
    url: "/repo/anthropic/claude-code",
    firedAt: new Date(NOW - 4 * HOURS).toISOString(),
    readAt: null,
    conditionValue: 824,
    threshold: 500,
  },
  {
    id: "evt-2",
    ruleId: "rule-mcp",
    repoId: "modelcontextprotocol/servers",
    userId: "local",
    trigger: "breakout_detected",
    title: "Breakout: GitHub + HN agreement",
    body: "modelcontextprotocol/servers fired on 2 signal channels in the last hour.",
    url: "/repo/modelcontextprotocol/servers",
    firedAt: new Date(NOW - 2 * HOURS).toISOString(),
    readAt: null,
    conditionValue: 2,
    threshold: 1,
  },
  {
    id: "evt-3",
    ruleId: "rule-skills",
    repoId: "anthropics/skills",
    userId: "local",
    trigger: "rank_jump",
    title: "Rank jump: #18 → #4",
    body: "anthropics/skills moved up 14 ranks in the last 24h.",
    url: "/repo/anthropics/skills",
    firedAt: new Date(NOW - 1 * DAYS).toISOString(),
    readAt: new Date(NOW - 18 * HOURS).toISOString(),
    conditionValue: 14,
    threshold: 10,
  },
  {
    id: "evt-4",
    ruleId: "rule-claude",
    repoId: "anthropic/claude-code",
    userId: "local",
    trigger: "star_spike",
    title: "+612 stars in 24h",
    body: "anthropic/claude-code crossed your 500-star threshold.",
    url: "/repo/anthropic/claude-code",
    firedAt: new Date(NOW - 3 * DAYS).toISOString(),
    readAt: new Date(NOW - 3 * DAYS + 30 * 60_000).toISOString(),
    conditionValue: 612,
    threshold: 500,
  },
  {
    id: "evt-5",
    ruleId: "rule-mcp",
    repoId: "punkpeye/awesome-mcp-servers",
    userId: "local",
    trigger: "breakout_detected",
    title: "Breakout: HN front page",
    body: "punkpeye/awesome-mcp-servers hit the HN front page.",
    url: "/repo/punkpeye/awesome-mcp-servers",
    firedAt: new Date(NOW - 5 * DAYS).toISOString(),
    readAt: new Date(NOW - 5 * DAYS + 4 * HOURS).toISOString(),
    conditionValue: 1,
    threshold: 1,
  },
];

function formatAge(event: AlertEvent): string {
  const t = Date.parse(event.firedAt);
  if (!Number.isFinite(t)) return "—";
  const diff = NOW - t;
  if (diff < HOURS) return `${Math.max(1, Math.floor(diff / 60_000))}M`;
  if (diff < DAYS) return `${Math.floor(diff / HOURS)}H`;
  return `${Math.floor(diff / DAYS)}D`;
}

function repoLabel(event: AlertEvent): string {
  return event.repoId;
}

export default function AlertsPage() {
  const events = [...SEED_EVENTS].sort(
    (a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt),
  );
  const rules = SEED_RULES;

  const unread = events.filter((e) => e.readAt === null).length;
  const todayCount = events.filter(
    (e) => NOW - Date.parse(e.firedAt) < DAYS,
  ).length;
  const enabledRules = rules.filter((r) => r.enabled).length;
  const lastFiredAt = events.length > 0 ? events[0].firedAt : null;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>ALERTS</b> · TERMINAL · /ALERTS
          </>
        }
        h1="Alerts inbox · trigger control."
        lede="Per-repo alert rules + the live firing inbox. Toggle alerts from the watchlist row or any repo detail page; everything fires here in real time once the worker is wired (Phase 2)."
        clock={
          <>
            <span className="big">{unread}</span>
            <span className="muted">UNREAD · {events.length} TOTAL</span>
            <LiveDot
              tone={unread > 0 ? "money" : "amber"}
              label={unread > 0 ? "LIVE" : "QUIET"}
            />
          </>
        }
      />

      <VerdictRibbon
        tone={unread > 0 ? "money" : "amber"}
        stamp={{
          eyebrow: "// ALERT TAPE",
          headline: lastFiredAt
            ? `LAST FIRED ${formatAge({ firedAt: lastFiredAt } as AlertEvent)} AGO`
            : "QUIET",
          sub: `${enabledRules} rule${enabledRules === 1 ? "" : "s"} active · ${rules.length - enabledRules} paused`,
        }}
        text={
          unread > 0 ? (
            <>
              <b>{unread} unread</b> alert{unread === 1 ? "" : "s"} in your
              inbox.{" "}
              <span style={{ color: "var(--v4-violet)" }}>
                {todayCount} today
              </span>
              . Worker fires every 30 min once Phase 2 ships — for now this
              page renders seed events to validate the V4 chrome.
            </>
          ) : (
            <>
              No unread alerts. {rules.length} rule
              {rules.length === 1 ? "" : "s"} configured;{" "}
              <span style={{ color: "var(--v4-money)" }}>{enabledRules} active</span>.
              Toggle a rule below or add new triggers from{" "}
              <Link href="/watchlist" style={{ color: "var(--v4-acc)" }}>
                /watchlist
              </Link>
              .
            </>
          )
        }
        actionHref="/watchlist"
        actionLabel="WATCHLIST →"
      />

      <KpiBand
        className="kpi-band"
        cells={[
          {
            label: "UNREAD",
            value: unread,
            sub: "in inbox",
            tone: unread > 0 ? "money" : "default",
            pip: unread > 0 ? "var(--v4-money)" : "var(--v4-ink-300)",
          },
          {
            label: "TODAY",
            value: todayCount,
            sub: "fired in 24h",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "RULES",
            value: rules.length,
            sub: `${enabledRules} active`,
            pip: "var(--v4-violet)",
          },
          {
            label: "TOTAL FIRED",
            value: events.length,
            sub: "all time",
            pip: "var(--v4-blue)",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Inbox"
        meta={
          <>
            <b>{events.length}</b> events · grouped by recency
          </>
        }
      />
      <AlertInbox
        events={events}
        formatAge={formatAge}
        repoLabel={repoLabel}
      />

      <SectionHead
        num="// 02"
        title="Trigger rules"
        meta={
          <>
            <b>{enabledRules}</b>/{rules.length} active · cooldown enforced
          </>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rules.map((rule) => (
          <AlertTriggerCard
            key={rule.id}
            rule={rule}
            repoLabel={rule.repoId ?? rule.categoryId ?? "all repos"}
          />
        ))}
      </div>

      <SectionHead
        num="// 03"
        title="What fires here"
        meta={<>8 trigger types · cross-source signal grade</>}
      />
      <div
        style={{
          padding: 20,
          background: "var(--v4-bg-025)",
          border: "1px solid var(--v4-line-100)",
          borderRadius: 2,
          fontSize: 13,
          color: "var(--v4-ink-300)",
          lineHeight: 1.6,
        }}
      >
        <p style={{ marginBottom: 12, color: "var(--v4-ink-100)" }}>
          <b>Phase 1 (today):</b> page surface live, seed events render so you
          can see the chrome. <Link href="/watchlist" style={{ color: "var(--v4-acc)" }}>/watchlist</Link> +{" "}
          <Link href="/repo/[owner]/[name]" style={{ color: "var(--v4-acc)" }}>repo detail</Link> have AlertToggle wired.
        </p>
        <p style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--v4-ink-100)" }}>Phase 2 (next):</b> worker
          job at <code>apps/trendingrepo-worker/src/fetchers/alerts/</code>{" "}
          evaluates rules every 30 min, writes events to Redis (
          <code>alerts:&#123;userId&#125;:events</code>), and fans out via the{" "}
          <code>BrowserAlertBridge</code> for real-time inbox updates without a
          page refresh.
        </p>
        <p>
          <b style={{ color: "var(--v4-ink-100)" }}>Trigger types:</b>{" "}
          star_spike · rank_jump · breakout_detected · momentum_threshold ·
          discussion_spike · new_release · daily_digest · weekly_digest.
        </p>
      </div>
    </main>
  );
}
