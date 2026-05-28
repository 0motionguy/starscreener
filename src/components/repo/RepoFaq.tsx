// RepoFaq — deterministic Q&A panel derived from existing repo + community
// + profile data. No LLM cost, no new fetchers. Native <details>/<summary>
// for the accordion — zero client JS, full a11y semantics.
//
// Questions are filtered to those we can answer truthfully: missing data
// drops the row rather than rendering a placeholder. If fewer than 3
// answerable Q's remain, the card hides entirely so we never ship a
// half-empty FAQ.

import type { JSX } from "react";

import { classifyFreshness } from "@/lib/news/freshness";
import type { RepoCommunityProfile } from "@/lib/repo-community-profile";
import type { RepoProfile } from "@/lib/repo-profiles";
import type { Repo } from "@/lib/types";

interface RepoFaqProps {
  repo: Repo;
  community: RepoCommunityProfile | null;
  profile: RepoProfile | null;
}

interface FaqEntry {
  q: string;
  a: JSX.Element | string;
  /** Plain-text answer for FAQPage JSON-LD — must match what `a` renders. */
  text: string;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function maintenanceVerdict(repo: Repo): string {
  const v = classifyFreshness("repos", repo.lastCommitAt);
  if (v.ageMs === null) return "unknown — no recent commit data";
  if (v.status === "live") return "yes — actively maintained (recent commits)";
  if (v.status === "warn") return "yes — but slowing (commits within months)";
  return "stalled — no commits for an extended period";
}

export function buildFaq({ repo, community, profile }: RepoFaqProps): FaqEntry[] {
  const out: FaqEntry[] = [];

  // 1. What is this repo?
  if (repo.description?.trim()) {
    out.push({
      q: `What is ${repo.fullName}?`,
      a: repo.description.trim(),
      text: repo.description.trim(),
    });
  }

  // 2. Who maintains it?
  const ownerType =
    community?.ownerProfile?.type === "Organization"
      ? "organization"
      : community?.ownerProfile?.type === "User"
        ? "individual maintainer"
        : "the owner";
  const ownerLabel = community?.ownerProfile?.name?.trim() || repo.owner;
  out.push({
    q: `Who maintains ${repo.name}?`,
    a: (
      <>
        Maintained by <b>{ownerLabel}</b> ({ownerType}) on{" "}
        <a
          href={`https://github.com/${repo.owner}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          GitHub
        </a>
        {community?.ownerProfile?.publicRepos
          ? ` · ${community.ownerProfile.publicRepos.toLocaleString()} public repos`
          : ""}
        .
      </>
    ),
    text: `Maintained by ${ownerLabel} (${ownerType}) on GitHub${
      community?.ownerProfile?.publicRepos
        ? ` · ${community.ownerProfile.publicRepos.toLocaleString()} public repos`
        : ""
    }.`,
  });

  // 3. What's the primary language?
  if (repo.language) {
    const top = community?.languages?.languages?.slice(0, 3) ?? [];
    const breakdown = top.length
      ? ` Breakdown: ${top.map((l) => `${l.name} ${l.percent}%`).join(", ")}.`
      : "";
    out.push({
      q: `What language is ${repo.name} written in?`,
      a: `Primarily ${repo.language}.${breakdown}`,
      text: `Primarily ${repo.language}.${breakdown}`,
    });
  }

  // 4. When was it created / last updated?
  const created = formatDate(repo.createdAt);
  const updated = formatDate(repo.lastCommitAt);
  if (created || updated) {
    out.push({
      q: `When was ${repo.name} created? When was the last update?`,
      a: `${created ? `Created ${created}` : "Creation date unknown"}${
        updated ? ` · last commit ${updated}.` : "."
      }`,
      text: `${created ? `Created ${created}` : "Creation date unknown"}${
        updated ? ` · last commit ${updated}.` : "."
      }`,
    });
  }

  // 5. How do I install it?
  const npmPkg = profile?.surfaces?.npmPackages?.[0] ?? null;
  if (npmPkg) {
    out.push({
      q: `How do I install ${repo.name}?`,
      a: (
        <>
          Install from npm:
          <pre className="pf-faq-code">
            <code>npm install {npmPkg}</code>
          </pre>
          Or visit{" "}
          <a
            href={`https://www.npmjs.com/package/${npmPkg}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            npmjs.com/package/{npmPkg}
          </a>
          .
        </>
      ),
      text: `Install from npm: npm install ${npmPkg}. Or visit npmjs.com/package/${npmPkg}.`,
    });
  } else {
    out.push({
      q: `How do I install ${repo.name}?`,
      a: (
        <>
          Clone the repo:
          <pre className="pf-faq-code">
            <code>git clone https://github.com/{repo.fullName}.git</code>
          </pre>
          Then follow the README in the cloned directory.
        </>
      ),
      text: `Clone the repo: git clone https://github.com/${repo.fullName}.git — then follow the README in the cloned directory.`,
    });
  }

  // 6. Active maintenance?
  const maintenance = maintenanceVerdict(repo);
  out.push({
    q: `Is ${repo.name} actively maintained?`,
    a: maintenance,
    text: maintenance,
  });

  // 7. License?
  if (community?.license?.spdxId) {
    out.push({
      q: `What's the license for ${repo.name}?`,
      a: community.license.url ? (
        <>
          {community.license.name} (
          <a
            href={community.license.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {community.license.spdxId}
          </a>
          ).
        </>
      ) : (
        `${community.license.name} (${community.license.spdxId}).`
      ),
      text: `${community.license.name} (${community.license.spdxId}).`,
    });
  }

  // 8. Homepage / docs?
  const docsUrl =
    profile?.surfaces?.docsUrl ?? community?.documentationUrl ?? null;
  const homepageUrl =
    profile?.websiteUrl ?? community?.homepageUrl ?? null;
  if (docsUrl || homepageUrl) {
    out.push({
      q: `Where can I read the docs?`,
      a: (
        <>
          {docsUrl ? (
            <>
              Documentation:{" "}
              <a href={docsUrl} target="_blank" rel="noreferrer noopener">
                {(() => {
                  try {
                    return new URL(docsUrl).hostname;
                  } catch {
                    return docsUrl;
                  }
                })()}
              </a>
              .{" "}
            </>
          ) : null}
          {homepageUrl ? (
            <>
              Project homepage:{" "}
              <a href={homepageUrl} target="_blank" rel="noreferrer noopener">
                {(() => {
                  try {
                    return new URL(homepageUrl).hostname;
                  } catch {
                    return homepageUrl;
                  }
                })()}
              </a>
              .
            </>
          ) : null}
        </>
      ),
      text: `${docsUrl ? `Documentation: ${hostOf(docsUrl)}. ` : ""}${
        homepageUrl ? `Project homepage: ${hostOf(homepageUrl)}.` : ""
      }`.trim(),
    });
  }

  return out;
}

export function RepoFaq(props: RepoFaqProps): JSX.Element | null {
  const entries = buildFaq(props);
  // If fewer than 3 questions are answerable, don't ship a stub card.
  if (entries.length < 3) return null;

  return (
    <section className="card pf-card pf-faq" aria-labelledby="pf-faq-head">
      <div className="card-head">
        <h2 className="card-title" id="pf-faq-head">
          {"▌"} <b>FAQ</b> {"·"} answers from the data spine
        </h2>
      </div>
      <div className="pf-faq-list">
        {entries.map((entry, idx) => (
          <details key={entry.q} className="pf-faq-item" open={idx === 0}>
            <summary className="pf-faq-q">{entry.q}</summary>
            <div className="pf-faq-a">{entry.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
