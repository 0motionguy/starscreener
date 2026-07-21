// Backfill tr.user_tiers.profile_id from the canonical entitlement key
// (c_<clerkUserId>) → profiles.clerk_user_id.
//
//   npm run backfill:user-tier-profiles              (dry-run report)
//   npm run backfill:user-tier-profiles -- --apply   (write profile_id)
//
// Rules:
//   - c_<clerkUserId> rows are matched to profiles.clerk_user_id and linked;
//   - legacy u_<hmac> rows CANNOT be resolved deterministically → reported,
//     never guessed (ownership must not be inferred);
//   - c_ rows with no matching profile are reported too.
//
// Skips cleanly without DATABASE_URL (prints a status; never pretends to run).

interface BackfillReport {
  mode: "dry-run" | "apply";
  total: number;
  alreadyLinked: number;
  linked: number; // applied
  wouldLink: number; // dry-run matches
  unresolvedLegacyU: number;
  unresolvedCanonicalNoProfile: number;
  unresolvedOther: number;
  samples: {
    unresolvedLegacyU: string[];
    unresolvedCanonicalNoProfile: string[];
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  if (!process.env.DATABASE_URL) {
    console.log(
      JSON.stringify(
        { skipped: true, reason: "DATABASE_URL not set — nothing to backfill" },
        null,
        2,
      ),
    );
    return;
  }

  const [{ getDb }, { userTiers }, { profiles }, { eq }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/user-tiers"),
    import("@/lib/db/schema/profiles"),
    import("drizzle-orm"),
  ]);
  const db = getDb();

  const rows = await db
    .select({ userId: userTiers.userId, profileId: userTiers.profileId })
    .from(userTiers);

  const report: BackfillReport = {
    mode: apply ? "apply" : "dry-run",
    total: rows.length,
    alreadyLinked: 0,
    linked: 0,
    wouldLink: 0,
    unresolvedLegacyU: 0,
    unresolvedCanonicalNoProfile: 0,
    unresolvedOther: 0,
    samples: { unresolvedLegacyU: [], unresolvedCanonicalNoProfile: [] },
  };
  const sample = (arr: string[], v: string) => {
    if (arr.length < 10) arr.push(v);
  };

  for (const row of rows) {
    if (row.profileId) {
      report.alreadyLinked += 1;
      continue;
    }
    if (row.userId.startsWith("c_")) {
      const clerkUserId = row.userId.slice(2);
      const matched = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.clerkUserId, clerkUserId))
        .limit(1);
      const profile = matched[0];
      if (profile) {
        if (apply) {
          await db
            .update(userTiers)
            .set({ profileId: profile.id })
            .where(eq(userTiers.userId, row.userId));
          report.linked += 1;
        } else {
          report.wouldLink += 1;
        }
      } else {
        report.unresolvedCanonicalNoProfile += 1;
        sample(report.samples.unresolvedCanonicalNoProfile, row.userId);
      }
    } else if (row.userId.startsWith("u_")) {
      report.unresolvedLegacyU += 1;
      sample(report.samples.unresolvedLegacyU, row.userId);
    } else {
      report.unresolvedOther += 1;
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(
    "[backfill:user-tier-profiles] failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
