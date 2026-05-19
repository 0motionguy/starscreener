// /refer/leaderboard — public top-50 referrers leaderboard.
//
// Public page. No auth gate. ISR 600s — referral counts move slowly enough
// that 10-minute freshness is plenty, and the CDN can cache the rendered
// HTML so it costs zero DB hits per request once warm.
//
// Source query: count `referrals.qualified_at IS NOT NULL` per referrer,
// joined to `profiles` so we have the handle/avatar/display name. We only
// surface profiles that explicitly opted into the public leaderboard via
// `profiles.public_leaderboard_optin = true`. Empty state = nobody opted
// in yet, with a hint pointing the visitor to /you/refer.

import Link from "next/link";
import type { Metadata } from "next";
import { count, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import { referrals } from "@/lib/db/schema/referrals";

// Drizzle DB query — must run at request time. Was `revalidate = 600`
// (10-min ISR) but prod build prerenders ISR pages and drizzle's
// db client throws during prerender if DATABASE_URL is unset (and
// without DATABASE_URL the cache would be useless anyway).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top Referrers — TrendingRepo",
  description: "See who is bringing the most operators to TrendingRepo.",
};

interface LeaderboardRow {
  handle: string;
  avatarUrl: string | null;
  displayName: string | null;
  referralCount: number;
}

async function getTopReferrers(): Promise<LeaderboardRow[]> {
  // Wrap the Drizzle query in try/catch — when DATABASE_URL is missing or
  // the Supabase pooler is unreachable (dev without `.env.local`, prod
  // with stale secret, transient network), the db client throws and
  // crashes the page (digest 1521999500 observed 2026-05-10). The page
  // already renders an empty-state for `rows.length === 0`, so degrading
  // to "no referrers yet" is strictly better than the error boundary.
  try {
    const rows = await db
      .select({
        handle: profiles.handle,
        avatarUrl: profiles.avatarUrl,
        displayName: profiles.displayName,
        referralCount: count(referrals.id).mapWith(Number),
      })
      .from(referrals)
      .innerJoin(profiles, eq(profiles.id, referrals.referrerProfileId))
      .where(
        sql`${isNotNull(referrals.qualifiedAt)} AND ${profiles.publicLeaderboardOptin} = true`,
      )
      .groupBy(profiles.id, profiles.handle, profiles.avatarUrl, profiles.displayName)
      .orderBy(desc(count(referrals.id)))
      .limit(50);

    return rows.map((row) => ({
      handle: row.handle,
      avatarUrl: row.avatarUrl,
      displayName: row.displayName,
      referralCount: row.referralCount,
    }));
  } catch (err) {
    console.warn(
      "[refer/leaderboard] DB query failed, rendering empty state:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export default async function ReferLeaderboardPage() {
  const rows = await getTopReferrers();

  return (
    <main
      className="home-surface"
      style={{
        paddingTop: 24,
        paddingBottom: 48,
        maxWidth: 880,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <p
          style={{
            fontFamily: "var(--v4-mono)",
            fontSize: 12,
            color: "var(--v4-ink-400)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          REFERRAL LEADERBOARD
        </p>
        <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: "8px 0 0" }}>
          Top Referrers
        </h1>
        <p style={{ marginTop: 12, color: "var(--v4-ink-300)" }}>
          These operators have brought the most builders to TrendingRepo. Want
          in? Invite friends and opt in.
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            fontFamily: "var(--v4-mono)",
            fontSize: 13,
            color: "var(--v4-ink-300)",
            border: "1px dashed var(--v4-line-200)",
            borderRadius: 2,
            background: "var(--v4-bg-025)",
          }}
        >
          Nobody has opted in yet. Be the first — head to{" "}
          <Link
            href="/you/refer"
            style={{ color: "var(--v4-acc)", textDecoration: "underline" }}
          >
            /you/refer
          </Link>{" "}
          to get your link and toggle public leaderboard on.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--v4-line-200)",
            borderRadius: 2,
            background: "var(--v4-bg-025)",
            overflow: "hidden",
          }}
        >
          <table className="w-full" style={{ width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--v4-line-200)" }}>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontFamily: "var(--v4-mono)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "var(--v4-ink-400)",
                    width: 64,
                  }}
                >
                  Rank
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontFamily: "var(--v4-mono)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "var(--v4-ink-400)",
                  }}
                >
                  Operator
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    fontFamily: "var(--v4-mono)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "var(--v4-ink-400)",
                  }}
                >
                  Qualified Referrals
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.handle}
                  style={{
                    borderBottom:
                      idx < rows.length - 1
                        ? "1px solid var(--v4-line-100)"
                        : "none",
                  }}
                >
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: "var(--v4-mono)",
                      fontSize: 12,
                      color: "var(--v4-ink-300)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    #{idx + 1}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <a
                      href={`/u/${row.handle}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        color: "var(--v4-ink-100)",
                        textDecoration: "none",
                      }}
                    >
                      {row.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.avatarUrl}
                          alt={`@${row.handle}`}
                          loading="lazy"
                          width={24}
                          height={24}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 3,
                            border: "1px solid var(--v4-line-200)",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 3,
                            background: "var(--v4-bg-100)",
                            border: "1px solid var(--v4-line-200)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "var(--v4-mono)",
                            fontSize: 11,
                            color: "var(--v4-ink-300)",
                          }}
                        >
                          {row.handle.slice(0, 1).toLowerCase()}
                        </span>
                      )}
                      <span style={{ fontWeight: 500 }}>@{row.handle}</span>
                      {row.displayName ? (
                        <span
                          style={{
                            color: "var(--v4-ink-400)",
                            fontSize: 12,
                          }}
                        >
                          {row.displayName}
                        </span>
                      ) : null}
                    </a>
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontFamily: "var(--v4-mono)",
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--v4-acc)",
                      fontWeight: 500,
                    }}
                  >
                    {row.referralCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
