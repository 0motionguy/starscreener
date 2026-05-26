// RepoOwnerRepoSnapshot — the combined OWNER · ORG · REPO SNAPSHOT
// card from the "Profile - standalone.html" reference (`PFOwnerRepoCard`),
// rebuilt 1:1 against the production design system.
//
// Replaces `RepoOwnerCard` for the `/repo/[owner]/[name]` surface: one card
// merges the org identity row (logo + verified chip + founders + bio + link
// pills) with the repo snapshot grid (6 stat cells) and the org grid (7 KV
// cells). Driven purely by `repo` + `RepoCommunityProfile`; nothing is
// synthesized — missing fields render `—` and a dim modifier.
//
// SHELL.CSS contract (the runtime ground truth):
//   - `.pf-combo` wraps the card.
//   - `.pf-combo-top` is a 3-col grid: logo · id · links.
//   - `.pf-stat` cells use `.lbl` / `.val` / `.delta` (NOT the legacy
//     `l`/`v`/`sub` schema in the standalone HTML — shell.css migrated
//     the names). `.delta.is-up` / `.delta.is-down` colour the trend
//     direction. We also keep the `.sub` / `.up` / `.warn` / `.dim`
//     markers so a future shell.css sync that lands the legacy names
//     still renders correctly.
//   - `.pf-combo-org-kv` cells use `.lbl` / `.val`; `.v.accent` and
//     `.v.dim` modifiers are defined in `styles.css` (C:/tmp/) and will
//     be honoured once they're ported to shell.css.
//   - Corner brackets via `.pf-corner-*` (already in shell.css).

import type { JSX } from "react";

import { Icon } from "@/components/icon/Icon";
import { SourceLogo } from "@/components/icon/Icon";
import type { RepoCommunityProfile } from "@/lib/repo-community-profile";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface RepoOwnerRepoSnapshotProps {
  repo: Repo;
  community: RepoCommunityProfile | null;
}

/** Compact display: 12_345 → "12,345" (locale full). */
function fmtFull(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

/** Strip a leading `https?://` so link-pill text stays compact. */
function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** Normalize a blog/homepage value into an `https://…` URL. */
function normalizeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

interface OrgCellSpec {
  label: string;
  value: string;
  /** Modifier to apply on the `.val` span — `accent` for highlight, `dim` for the "—" state. */
  modifier?: "accent" | "dim";
}

export function RepoOwnerRepoSnapshot({
  repo,
  community,
}: RepoOwnerRepoSnapshotProps): JSX.Element {
  const org = community?.organization;
  const ownerName = repo.owner;
  const logoLetter = ownerName.charAt(0).toUpperCase();

  // ───────────────────────────── identity ─────────────────────────────
  const verified = org?.isVerified === true;
  const founders = org?.founders ?? [];
  const bio =
    org?.description?.trim() ||
    community?.description?.trim() ||
    community?.ownerProfile?.bio?.trim() ||
    repo.description?.trim() ||
    "";

  // ───────────────────────────── link pills ───────────────────────────
  const websiteHref =
    normalizeHref(org?.blog ?? null) ??
    normalizeHref(community?.homepage ?? null) ??
    normalizeHref(community?.homepageUrl ?? null) ??
    normalizeHref(community?.ownerProfile?.blog ?? null);
  const twitterHandle =
    org?.twitterUsername?.trim() ||
    community?.ownerProfile?.twitterUsername?.trim() ||
    "";
  const huggingfaceHandle = org?.huggingfaceHandle?.trim() ?? "";

  // ───────────────────────────── stats grid ───────────────────────────
  const starsD7 = repo.starsDelta7d ?? 0;
  const forksD7 = repo.forksDelta7d ?? 0;
  const contributorsCount =
    community?.contributorsCount ?? repo.contributors ?? null;
  const openIssues = community?.openIssues ?? repo.openIssues ?? 0;
  const openPRs = community?.openPullRequests ?? community?.openPullsCount ?? 0;
  const licenseSpdx =
    community?.licenseSpdx ?? community?.license?.spdxId ?? null;

  const langName =
    community?.languages?.languages?.[0]?.name ?? repo.language ?? null;
  const langColor =
    community?.primaryLanguageColor ??
    community?.languages?.languages?.[0]?.color ??
    null;

  // ───────────────────────────── org KV grid ──────────────────────────
  const orgCells: OrgCellSpec[] = [
    {
      label: "FOUNDED",
      value: org?.foundedAt?.trim() || "—",
      modifier: org?.foundedAt?.trim() ? undefined : "dim",
    },
    {
      label: "LOCATION",
      value: org?.location?.trim() || community?.ownerProfile?.location?.trim() || "—",
      modifier:
        org?.location?.trim() || community?.ownerProfile?.location?.trim()
          ? undefined
          : "dim",
    },
    {
      label: "MEMBERS",
      value:
        typeof org?.memberCount === "number"
          ? fmtFull(org.memberCount)
          : typeof community?.ownerProfile?.membersCount === "number"
            ? fmtFull(community.ownerProfile.membersCount)
            : "—",
      modifier:
        typeof org?.memberCount === "number" ||
        typeof community?.ownerProfile?.membersCount === "number"
          ? undefined
          : "dim",
    },
    {
      label: "PUBLIC REPOS",
      value:
        typeof org?.publicReposCount === "number"
          ? fmtFull(org.publicReposCount)
          : typeof community?.ownerProfile?.publicRepos === "number"
            ? fmtFull(community.ownerProfile.publicRepos)
            : "—",
      modifier:
        typeof org?.publicReposCount === "number" ||
        typeof community?.ownerProfile?.publicRepos === "number"
          ? undefined
          : "dim",
    },
    {
      label: "TOTAL STARS",
      value:
        typeof org?.totalStars === "number" ? formatNumber(org.totalStars) : "—",
      modifier: typeof org?.totalStars === "number" ? undefined : "dim",
    },
    {
      label: "FOCUS",
      value: org?.primaryFocus?.trim() || "—",
      modifier: org?.primaryFocus?.trim() ? "accent" : "dim",
    },
    {
      label: "FUNDING",
      value: org?.fundingStatus?.trim() || "—",
      modifier: "dim",
    },
  ];

  // ─────────────────────────── render ─────────────────────────────────
  return (
    <section
      className="card pf-card pf-combo"
      aria-labelledby="pf-combo-head"
    >
      <div className="pf-corner pf-corner-tl" aria-hidden="true" />
      <div className="pf-corner pf-corner-tr" aria-hidden="true" />
      <div className="pf-corner pf-corner-bl" aria-hidden="true" />
      <div className="pf-corner pf-corner-br" aria-hidden="true" />

      <header className="pf-card-head">
        <h3 id="pf-combo-head">
          <span className="slash">{"// "}</span>OWNER · {ownerName}
          {" · "}
          REPO SNAPSHOT
        </h3>
        <div className="meta">github.com/{ownerName}</div>
      </header>

      <div className="pf-combo-top">
        <div className="pf-combo-logo" aria-hidden="true">
          {logoLetter}
        </div>

        <div className="pf-combo-id">
          <h2 className="pf-combo-name">
            {ownerName}
            {verified ? (
              <span className="pf-owner-verify"> ◉ verified org</span>
            ) : null}
            {founders.length > 0 ? (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-soft, var(--fg-muted))",
                  fontWeight: 400,
                  marginLeft: 6,
                }}
              >
                · {founders.map((f) => `@${f.replace(/^@/, "")}`).join(" · ")}
              </span>
            ) : null}
          </h2>
          <p className="pf-combo-bio">{bio}</p>
        </div>

        <div className="pf-combo-links">
          {websiteHref ? (
            <a
              className="pf-link-pill"
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="arrow-up-right" size="sm" />
              {stripScheme(websiteHref)}
            </a>
          ) : null}

          <a
            className="pf-link-pill"
            href={`https://github.com/${ownerName}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <SourceLogo source="github" size="sm" />
            {ownerName}
          </a>

          {twitterHandle ? (
            <a
              className="pf-link-pill"
              href={`https://x.com/${twitterHandle.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <SourceLogo source="x-twitter" size="sm" />
              {`@${twitterHandle.replace(/^@/, "")}`}
            </a>
          ) : null}

          {huggingfaceHandle ? (
            <a
              className="pf-link-pill"
              href={`https://huggingface.co/${huggingfaceHandle.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <SourceLogo source="huggingface" size="sm" />
              {`hf/${huggingfaceHandle.replace(/^@/, "")}`}
            </a>
          ) : null}
        </div>
      </div>

      <div className="pf-combo-stats">
        {/* STARS */}
        <div className="pf-stat">
          <span className="lbl l">STARS</span>
          <span className="val v">{fmtFull(repo.stars)}</span>
          <span
            className={`delta sub ${starsD7 >= 0 ? "is-up up" : "is-down down"}`}
          >
            {starsD7 >= 0 ? "+" : ""}
            {starsD7.toLocaleString("en-US")} · 7d
          </span>
        </div>

        {/* FORKS */}
        <div className="pf-stat">
          <span className="lbl l">FORKS</span>
          <span className="val v">{fmtFull(repo.forks)}</span>
          <span
            className={`delta sub ${forksD7 >= 0 ? "is-up up" : "is-down down"}`}
          >
            {forksD7 >= 0 ? "+" : ""}
            {forksD7.toLocaleString("en-US")} · 7d
          </span>
        </div>

        {/* CONTRIBUTORS */}
        <div className="pf-stat">
          <span className="lbl l">CONTRIBUTORS</span>
          <span
            className={`val v${contributorsCount === null ? " dim" : ""}`}
          >
            {contributorsCount === null ? "—" : fmtFull(contributorsCount)}
          </span>
          <span className="delta sub">
            {typeof contributorsCount === "number" && contributorsCount < 10
              ? "maintainer graph thin"
              : " "}
          </span>
        </div>

        {/* OPEN ISSUES / PRS */}
        <div className="pf-stat">
          <span className="lbl l">OPEN ISSUES · PRS</span>
          <span className="val v">
            {fmtFull(openIssues)}
            <span
              style={{
                color: "var(--text-soft, var(--fg-muted))",
                fontSize: 13,
                marginLeft: 4,
              }}
            >
              · {fmtFull(openPRs)}
            </span>
          </span>
          <span className="delta sub">{" "}</span>
        </div>

        {/* LICENSE */}
        <div className="pf-stat">
          <span className="lbl l">LICENSE</span>
          <span className={`val v${licenseSpdx ? "" : " dim"}`}>
            {licenseSpdx ?? "—"}
          </span>
          <span className={`delta sub${licenseSpdx ? "" : " warn"}`}>
            {licenseSpdx ? " " : "no license file"}
          </span>
        </div>

        {/* LANGUAGE */}
        <div className="pf-stat">
          <span className="lbl l">LANGUAGE</span>
          <span
            className={`val v${langName ? "" : " dim"}`}
            style={{ fontSize: 15, lineHeight: 1.3 }}
          >
            {langName ? (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: langColor ?? "var(--text-dim, #4a5562)",
                    marginRight: 6,
                    verticalAlign: "middle",
                  }}
                />
                {langName}
              </>
            ) : (
              "—"
            )}
          </span>
          <span className="delta sub">{" "}</span>
        </div>
      </div>

      <div className="pf-combo-org">
        {orgCells.map((cell) => (
          <div key={cell.label} className="pf-combo-org-kv">
            <span className="lbl k">{cell.label}</span>
            <span
              className={`val v${cell.modifier ? ` ${cell.modifier}` : ""}`}
            >
              {cell.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
