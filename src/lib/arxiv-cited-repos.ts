// arXiv-cited repos aggregator — derives the /research feed.
//
// Walks every paper in data/arxiv-trending.json, regex-extracts every
// github.com/{owner}/{repo} URL from the abstract, and produces a
// per-repo aggregate: how many papers cited it, latest citation, etc.
//
// Why this exists: Phase B as originally planned (intersect arxiv-cited
// repos with the social-momentum tracked set in trending.json) yielded
// 0 hits — academic-cited repos are publish-day-fresh research artifacts
// that haven't accumulated GitHub-trending momentum yet. So we pivot:
// surface the arxiv-cited set DIRECTLY as a discovery feed. This is the
// "academia-flagged before the crowd notices" signal.
//
// Reads from the same `data/arxiv-trending.json` that powers /papers, so
// no extra scrape, no extra Redis key. The aggregate is computed fresh
// on every refresh — cheap (≤500 papers × <10 URLs each).

import { getArxivTrendingFile } from "./arxiv-trending";
import type { ArxivPaper, ArxivTrendingFile } from "./arxiv-trending";
import {
  GITHUB_REPO_URL_RE,
  isReservedGithubOwner,
  normalizeGithubFullName,
} from "./github-repo-links";

function extractRepoCitations(paper: ArxivPaper): {
  fullName: string;
  charOffset: number;
}[] {
  if (!paper.abstract) return [];
  const seen = new Set<string>();
  const out: { fullName: string; charOffset: number }[] = [];
  // Use exec loop instead of matchAll — preserves the lastIndex offset
  // we need for confidence scoring (URL position in abstract). Regex +
  // owner/punctuation normalization come from ./github-repo-links so
  // /orgs, /settings, .git suffixes etc. stay in lockstep with collectors.
  GITHUB_REPO_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GITHUB_REPO_URL_RE.exec(paper.abstract)) !== null) {
    const fn = normalizeGithubFullName(m[1], m[2]);
    const [o, r] = fn.split("/");
    if (!o || !r || isReservedGithubOwner(o)) continue;
    if (seen.has(fn)) continue;
    seen.add(fn);
    out.push({ fullName: fn, charOffset: m.index });
  }
  return out;
}

export interface ResearchCitedRepoPaper {
  arxivId: string;
  title: string;
  absUrl: string;
  primaryCategory: string;
  submittedUtc: number;
  ageHours?: number;
  /** Char offset of the URL match in the abstract (lower = stronger signal). */
  charOffset: number;
  /** Confidence per Codex Q4 heuristic: 0.75 + 0.25 × (1 − offsetRatio). */
  confidence: number;
}

export interface ResearchCitedRepo {
  fullName: string;
  paperCount: number;
  latestSubmittedUtc: number;
  /** Top category across all citing papers (most-frequent). */
  topCategory: string;
  /** Confidence-weighted score for ranking. */
  score: number;
  /** Up to 5 citing papers, sorted newest-first. */
  papers: ResearchCitedRepoPaper[];
}

export interface ResearchCitedReposFile {
  fetchedAt: string;
  windowDays: number;
  scannedPapers: number;
  totalCitedRepos: number;
  totalUrlMatches: number;
  repos: ResearchCitedRepo[];
}

function aggregateCitedRepos(
  papers: ArxivPaper[],
  fetchedAt: string,
  windowDays: number,
): ResearchCitedReposFile {
  // map: lowercased fullName → builder state
  const buf = new Map<
    string,
    {
      papers: ResearchCitedRepoPaper[];
      categoryCounts: Map<string, number>;
      latestSubmittedUtc: number;
      score: number;
    }
  >();

  let totalUrlMatches = 0;

  for (const p of papers) {
    if (!p.abstract) continue;
    const abstractLen = Math.max(1, p.abstract.length);
    const cites = extractRepoCitations(p);
    totalUrlMatches += cites.length;
    for (const cite of cites) {
      const offsetRatio = Math.min(1, cite.charOffset / abstractLen);
      const confidence = 0.75 + 0.25 * (1 - offsetRatio);
      const paperEntry: ResearchCitedRepoPaper = {
        arxivId: p.arxivId,
        title: p.title,
        absUrl: p.absUrl,
        primaryCategory: p.primaryCategory ?? "",
        submittedUtc: p.submittedUtc,
        ageHours: p.ageHours,
        charOffset: cite.charOffset,
        confidence: Math.round(confidence * 1000) / 1000,
      };
      const slot = buf.get(cite.fullName) ?? {
        papers: [],
        categoryCounts: new Map<string, number>(),
        latestSubmittedUtc: 0,
        score: 0,
      };
      slot.papers.push(paperEntry);
      const cat = p.primaryCategory ?? "—";
      slot.categoryCounts.set(cat, (slot.categoryCounts.get(cat) ?? 0) + 1);
      if (p.submittedUtc > slot.latestSubmittedUtc) {
        slot.latestSubmittedUtc = p.submittedUtc;
      }
      // Composite score: confidence-weighted with a recency boost so a
      // paper from yesterday outranks one from 13 days ago.
      const ageDays = Math.max(
        0,
        (Date.now() / 1000 - p.submittedUtc) / 86400,
      );
      const recencyDecay = 1 / (ageDays + 1);
      slot.score += confidence * (0.7 + 0.3 * recencyDecay);
      buf.set(cite.fullName, slot);
    }
  }

  const repos: ResearchCitedRepo[] = [];
  for (const [fullName, slot] of buf.entries()) {
    // Pick top category (most-frequent across citing papers).
    let topCategory = "";
    let topCount = 0;
    for (const [cat, count] of slot.categoryCounts.entries()) {
      if (count > topCount) {
        topCount = count;
        topCategory = cat;
      }
    }
    // Sort papers newest-first, cap at 5 for display economy.
    const papersSorted = slot.papers
      .slice()
      .sort((a, b) => b.submittedUtc - a.submittedUtc)
      .slice(0, 5);
    repos.push({
      fullName,
      paperCount: slot.papers.length,
      latestSubmittedUtc: slot.latestSubmittedUtc,
      topCategory,
      score: Math.round(slot.score * 1000) / 1000,
      papers: papersSorted,
    });
  }

  // Rank: paperCount desc → score desc → latestSubmittedUtc desc.
  repos.sort((a, b) => {
    if (b.paperCount !== a.paperCount) return b.paperCount - a.paperCount;
    if (b.score !== a.score) return b.score - a.score;
    return b.latestSubmittedUtc - a.latestSubmittedUtc;
  });

  return {
    fetchedAt,
    windowDays,
    scannedPapers: papers.length,
    totalCitedRepos: repos.length,
    totalUrlMatches,
    repos,
  };
}

// Cached aggregate — recomputed on first read after each
// refreshArxivTrendingFromStore() swaps the underlying file reference.
//
// We key on the OBJECT IDENTITY of the trending file, not on its
// fetchedAt timestamp. Two scrapes in the same second (manual + cron, or
// rebase clock skew) produce identical timestamps but different objects,
// and the timestamp-based key would silently serve stale aggregates.
// The refresh hook always replaces the module-level reference wholesale,
// so identity checking is always-correct + cheap.
let cached:
  | { sourceRef: ArxivTrendingFile; data: ResearchCitedReposFile }
  | null = null;

function buildFromCurrentArxivFile(): ResearchCitedReposFile {
  const arxiv = getArxivTrendingFile();
  return aggregateCitedRepos(
    arxiv.papers ?? [],
    arxiv.fetchedAt ?? "",
    arxiv.windowDays ?? 14,
  );
}

export function getResearchCitedRepos(): ResearchCitedReposFile {
  const arxiv = getArxivTrendingFile();
  if (cached && cached.sourceRef === arxiv) return cached.data;
  const data = buildFromCurrentArxivFile();
  cached = { sourceRef: arxiv, data };
  return data;
}

export function getTopResearchCitedRepos(limit = 50): ResearchCitedRepo[] {
  const file = getResearchCitedRepos();
  if (file.repos.length <= limit) return file.repos;
  return file.repos.slice(0, limit);
}
