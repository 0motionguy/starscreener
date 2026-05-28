import { TOTAL_SCAN_CHANNEL_COUNT } from "@/lib/repo-scan-channels";
import {
  computeSubmissionStats,
  listPublicRepoSubmissions,
  toPublicRepoSubmission,
} from "@/lib/repo-submissions";

import { DropClient } from "./DropClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Drop a repo · TrendingRepo",
  description: `Paste a GitHub URL. We pull every byte of metadata, scan ${TOTAL_SCAN_CHANNEL_COUNT} sources for cross-source signal, and build the profile page so you don't have to.`,
};

async function fetchInitialState() {
  try {
    const [records, stats] = await Promise.all([
      listPublicRepoSubmissions(),
      computeSubmissionStats(),
    ]);
    return {
      submissions: records.slice(0, 25).map(toPublicRepoSubmission),
      stats,
      total: records.length,
    };
  } catch (err) {
    console.warn("[drop/page] initial state fetch failed:", err);
    return {
      submissions: [],
      stats: {
        droppedThisWeek: 0,
        percentListedUnder24h: 0,
        medianTtlHours: null,
      },
      total: 0,
    };
  }
}

export default async function DropPage() {
  const { submissions, stats, total } = await fetchInitialState();

  return (
    <main className={`main ${styles.dropScope}`} data-route="drop">
      <header className={styles.hero}>
        <p className={styles.eyebrow}>
          {"// DROP A REPO · SIMPLE INTAKE · AUTO-FETCH · AUTO-LIST"}
        </p>
        <h1 className={styles.title}>
          Drop a repo. <span className={styles.titleAccent}>We&apos;ll do the rest.</span>
        </h1>
        <p className={styles.subhead}>
          Paste a GitHub URL. We pull every byte of metadata, scan{" "}
          <b>{TOTAL_SCAN_CHANNEL_COUNT}</b> sources for cross-source signal,
          and build the profile page so you don&apos;t have to. No taxonomy,
          no review forms, no waiting for someone to notice.
        </p>
      </header>

      <DropClient
        initialSubmissions={submissions}
        initialStats={stats}
        initialTotalCount={total}
      />
    </main>
  );
}
