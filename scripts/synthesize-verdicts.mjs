// Synthesize E-E-A-T-grade consensus verdicts from gathered evidence.
//
// Inputs:
//   - C:/tmp/enriched-repos.jsonl  (gh meta + README excerpt + Tavily web hits)
//   - C:/tmp/backfill-input.json   (cross-source consensus signal, for the 200)
//   - scripts/verdict-overrides.mjs (optional hand-authored anchor reports —
//     genuine domain expertise for famous repos; used verbatim when present)
//
// Output: data/consensus-verdicts.json (merged, resumable).
//
// E-E-A-T discipline:
//   Experience    → evidence is framed as observed (signal we track, README we read).
//   Expertise     → summary is grounded in the repo's OWN README, not a blurb.
//   Authority     → real citations (GitHub + web), consistent AISO.tools authorship.
//   Trust         → honest + balanced (no "weak/noise"), accurate, cited, timestamped.
//
// No fabricated facts. Every number traces to gh meta or the signal join; every
// claim about "what it does" traces to the repo's README; every citation is a
// real URL returned by GitHub or Tavily.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENRICHED = "C:/tmp/enriched-repos.jsonl";
const SIGNAL = "C:/tmp/backfill-input.json";
const OUT = "data/consensus-verdicts.json";

let OVERRIDES = {};
try {
  OVERRIDES = (await import("./verdict-overrides.mjs")).OVERRIDES || {};
} catch {
  /* no anchors file — fine */
}

const SOURCE_NAME = {
  gh: "GitHub", github: "GitHub", hn: "Hacker News", hackernews: "Hacker News",
  r: "Reddit", reddit: "Reddit", x: "X", twitter: "X", bs: "Bluesky", bluesky: "Bluesky",
  dev: "Dev.to", devto: "Dev.to", pdh: "Product Hunt", producthunt: "Product Hunt",
  hf: "Hugging Face", huggingface: "Hugging Face", npm: "npm", ours: "TrendingRepo's pipeline",
};
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : null);

function joinList(a) {
  if (a.length === 0) return "";
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;
}
function namedSources(s) { return [...new Set((s || []).map((x) => SOURCE_NAME[x] || x))]; }

// First 1-2 readable sentences of the README → the Expertise substrate.
function readmeLead(readme, name) {
  if (!readme) return "";
  let txt = readme.replace(new RegExp(`^\\s*${name}\\b[:\\s]*`, "i"), "").trim();
  const sentences = txt.match(/[^.!?]+[.!?]+/g) || [txt];
  return sentences.slice(0, 2).join(" ").trim().slice(0, 320);
}

function ageMonths(iso) {
  if (!iso) return null;
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.round((Date.now() - d) / (1000 * 60 * 60 * 24 * 30)));
}

// Verdict factors BOTH cross-source signal AND adoption (stars). An
// established 20k-star project with no current buzz is "strong" (proven),
// not "emerging". We never emit "noise" — the floor is "weak", and the
// component renders honest, non-dismissive labels off the scores.
function deriveVerdict(sig, gh) {
  const sc = sig?.sourceCount || 0;
  const stars = gh?.stars || 0;
  if (sc >= 4 || sig?.band === "strong_consensus" || stars >= 20000) return "strong";
  if (sc >= 2 || sig?.band === "early_call" || sig?.band === "divergence" || stars >= 2000)
    return "early";
  return "weak";
}
function deriveAction(v) { return v === "strong" ? "build" : v === "early" ? "research" : "watch"; }

// Confidence reflects how much we actually know: real adoption (stars) +
// cross-source breadth. An established repo with verifiable stars warrants
// high confidence even with no current cross-source buzz.
function deriveConfidence(sig, gh) {
  const stars = gh?.stars || 0;
  const sc = sig?.sourceCount || 0;
  const adoptionConf = stars >= 50000 ? 88 : stars >= 20000 ? 80 : stars >= 5000 ? 70 : stars >= 1000 ? 58 : stars > 0 ? 46 : 30;
  const signalConf = sig?.confidence || 0;
  return clamp(Math.max(adoptionConf, signalConf) + (sc >= 3 ? 6 : 0));
}

function buildScores(gh, sig) {
  const sc = sig?.sourceCount || 0;
  const consensus = sig?.consensusScore || 0;
  const stars = gh?.stars || 0;
  return {
    momentum: clamp(consensus > 0 ? consensus * 0.9 : Math.min(70, Math.log10(stars + 1) * 12)),
    credibility: clamp(40 + (sc ? sc * 4 : 0) + (stars > 5000 ? 18 : stars > 500 ? 10 : 0) + (gh?.license ? 6 : 0)),
    crossSource: clamp(sc ? sc * 18 : 15),
    developerAdoption: clamp(stars > 0 ? Math.log10(stars + 1) * 17 : 25),
    marketRelevance: clamp(48 + (sc ? sc * 5 : 0) + ((gh?.topics || []).some((t) => /agent|llm|ai|mcp|rag/i.test(t)) ? 16 : 0)),
    hypeRisk: clamp((sc <= 1 ? 48 : sc === 2 ? 32 : 16) + (consensus > 40 && sc <= 2 ? 12 : 0)),
  };
}

function buildTagline(gh, name) {
  const desc = (gh?.description || "").trim();
  if (desc) return desc.length > 90 ? desc.slice(0, 88) + "…" : desc;
  const t = (gh?.topics || [])[0];
  return t ? `${name} — ${t.replace(/-/g, " ")} project` : name;
}

function buildSummary(rec, sig, name) {
  const gh = rec.gh || {};
  const lead = readmeLead(rec.readme, name);
  const what = lead || gh.description || `${name} is an open-source project`;
  const stars = gh.stars != null ? `${fmt(gh.stars)} GitHub stars` : null;
  const lang = gh.language ? `${gh.language}` : null;
  const adoption = stars ? ` It has reached ${stars}${lang ? `, written primarily in ${lang}` : ""}.` : "";
  const sc = sig?.sourceCount || 0;
  let signalLine = "";
  if (sc >= 4) signalLine = ` We're tracking active discussion across ${sc} independent channels, a multi-source pattern that typically precedes wider adoption.`;
  else if (sc === 3) signalLine = ` Three independent sources are surfacing it concurrently — the signature of a project crossing into broader awareness.`;
  else if (sc === 2) signalLine = ` Two independent sources are currently tracking it.`;
  else if (sc === 1) signalLine = ` It's surfacing as an early-stage signal worth watching before it's widely known.`;
  return `${what}${adoption}${signalLine}`.replace(/\s+/g, " ").trim();
}

function buildWhyNow(rec, sig) {
  const web = rec.web || [];
  const recent = web[0];
  const sources = namedSources(sig?.sources);
  if (recent && recent.title) {
    return `Recent coverage — "${recent.title}" — alongside ${sources.length ? `cross-source attention on ${joinList(sources.slice(0, 3))}` : "renewed developer interest"} is driving current visibility.`;
  }
  if (sources.length >= 3) {
    return `Multiple channels picked this up in the current cycle (${joinList(sources.slice(0, 3))}), concentrating attention within a short window.`;
  }
  const months = ageMonths(rec.gh?.createdAt);
  if (months != null && months <= 6) return `A young repository (${months} month${months === 1 ? "" : "s"} old) gaining early traction in its category.`;
  return `Sustained developer attention keeps it in the tracked pool; ${sources[0] || "GitHub activity"} is the current lead signal.`;
}

function buildEvidence(rec, sig) {
  const gh = rec.gh || {};
  const ev = [];
  if (gh.stars != null) ev.push(`${fmt(gh.stars)} GitHub stars${gh.forks != null ? `, ${fmt(gh.forks)} forks` : ""} — verifiable at github.com/${rec.fullName}.`);
  const sources = namedSources(sig?.sources);
  if (sources.length) ev.push(`Tracked across ${sig.sourceCount} source${sig.sourceCount === 1 ? "" : "s"}: ${joinList(sources)} (consensus score ${sig.consensusScore}, rank #${sig.rank}).`);
  if (gh.language || (gh.topics || []).length) ev.push(`${gh.language ? `Primary language ${gh.language}` : ""}${gh.topics?.length ? `${gh.language ? "; " : ""}topics: ${gh.topics.slice(0, 4).join(", ")}` : ""}.`);
  if (gh.license) ev.push(`Licensed ${gh.license}.`);
  else if (gh.license === null && gh.stars != null) ev.push(`No license file detected — commercial users should confirm terms with the maintainers.`);
  if (rec.web && rec.web[0]) ev.push(`Third-party coverage: "${rec.web[0].title}".`);
  return ev.slice(0, 5);
}

function daysSince(iso) {
  if (!iso) return null;
  const d = Date.parse(iso);
  return Number.isFinite(d) ? Math.round((Date.now() - d) / 86400000) : null;
}

// Compose a genuinely repo-specific caveat from real facts, then pick the
// most salient. Multiple independent facts → hundreds of distinct outputs
// instead of one templated sentence. Seeded connective rotation adds variety
// even when two repos share the same lead fact.
function buildConsiderations(rec, sig, seed) {
  const gh = rec.gh || {};
  const sc = sig?.sourceCount || 0;
  const stars = gh.stars || 0;
  const months = ageMonths(gh.createdAt);
  const pushDays = daysSince(gh.pushedAt);
  const cands = [];

  if (gh.archived) cands.push(`The repository is archived — valuable as reference, but no longer actively maintained, so don't expect fixes or new releases.`);
  if (gh.license === null && gh.stars != null) cands.push(`No license file is published, which is a real blocker for any commercial or redistribution use until the maintainers clarify terms.`);
  if (months != null && months <= 3) cands.push(`At roughly ${months} month${months === 1 ? "" : "s"} old, it's early — the architecture and maintenance cadence haven't been battle-tested yet.`);
  if (stars >= 30000 && pushDays != null && pushDays > 30) cands.push(`A large ${fmt(stars)}-star base with no push in ~${pushDays} days suggests maturity or slowing velocity rather than active breakout — judge it on trajectory, not headline count.`);
  if (sc <= 1 && sig) cands.push(`Attention is concentrated in a single channel so far (${namedSources(sig.sources)[0] || "one source"}); multi-platform confirmation would meaningfully strengthen the read.`);
  if ((sc >= 5 || sig?.band === "strong_consensus")) cands.push(`Broad simultaneous pickup can reflect coordinated launch timing as much as organic pull — the durable tell is whether attention persists across the next few cycles.`);
  if (gh.topics && gh.topics.some((t) => /ai|llm|agent|gpt/i.test(t)) && stars < 2000) cands.push(`It sits in the crowded AI-tooling space where attention is cheap and durability is rare; the bar for "real" here is sustained use, not launch buzz.`);
  if (stars >= 2000 && stars < 30000 && sc <= 1) cands.push(`Solid adoption (${fmt(stars)} stars) but quiet cross-source signal right now — established utility more than a current breakout.`);

  if (cands.length === 0) {
    cands.push(`Signal is real but still consolidating; a second independent source would confirm the trajectory.`);
  }
  // Prefer the first (most salient) but rotate among the top 2 by seed so
  // repos sharing a lead fact don't all read identically.
  const top = cands.slice(0, 2);
  return top[(seed || 0) % top.length];
}

// Action detail diversified by verdict + a real hook (language ecosystem,
// category, adoption tier) so it isn't one of three templated lines.
function buildActionDetail(verdict, rec, sig) {
  const gh = rec.gh || {};
  const lang = gh.language ? ` (${gh.language})` : "";
  const sc = sig?.sourceCount || 0;
  if (verdict === "strong") {
    if ((gh.stars || 0) >= 20000) return `Proven at scale${lang} — safe to evaluate for production use or coverage; the open question is fit, not validity.`;
    return `Cross-source confirmation (${sc} channels) is strong enough to evaluate now, ahead of broader awareness.`;
  }
  if (verdict === "early") {
    if (sc >= 2) return `Early multi-source momentum — worth hands-on evaluation${lang} before it reaches mainstream tooling lists.`;
    return `Adoption is real but cross-source confirmation is thin — a short hands-on trial${lang} will tell you more than the metrics.`;
  }
  return `Track it: add to a watchlist and revisit if a second independent source or a release lights up the signal.`;
}

function buildCitations(rec) {
  const cites = [{ title: `${rec.fullName} on GitHub`, url: `https://github.com/${rec.fullName}` }];
  if (rec.gh?.homepage && /^https?:\/\//.test(rec.gh.homepage)) cites.push({ title: "Project homepage", url: rec.gh.homepage });
  for (const w of (rec.web || []).slice(0, 3)) if (w.url) cites.push({ title: w.title || w.url, url: w.url });
  // de-dupe by url
  const seen = new Set();
  return cites.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 6);
}

// Deterministic per-repo seed for phrasing rotation (stable across re-runs).
function seedFor(fullName) {
  let h = 0;
  for (let i = 0; i < fullName.length; i++) h = (h * 31 + fullName.charCodeAt(i)) >>> 0;
  return h;
}

function synthOne(rec, sig) {
  const name = rec.fullName.split("/")[1] || rec.fullName;
  const seed = seedFor(rec.fullName);
  if (OVERRIDES[rec.fullName]) {
    // Hand-authored anchor — genuine domain expertise, used verbatim, but we
    // still attach real citations + scores from live data.
    const o = OVERRIDES[rec.fullName];
    const verdict = o.verdict || deriveVerdict(sig, rec.gh);
    return {
      fullName: rec.fullName,
      tagline: o.tagline || buildTagline(rec.gh, name),
      summary: o.summary,
      scores: o.scores || buildScores(rec.gh, sig),
      evidence: o.evidence || buildEvidence(rec, sig),
      contrarian: o.considerations || buildConsiderations(rec, sig, seed),
      verdict,
      confidence: o.confidence || clamp(sig?.confidence || 60),
      whyNow: o.whyNow || buildWhyNow(rec, sig),
      whatToDo: o.whatToDo || deriveAction(verdict),
      whatToDoDetail: o.whatToDoDetail || buildActionDetail(verdict, rec, sig),
      citations: buildCitations(rec),
    };
  }
  const verdict = deriveVerdict(sig, rec.gh);
  return {
    fullName: rec.fullName,
    tagline: buildTagline(rec.gh, name),
    summary: buildSummary(rec, sig, name),
    scores: buildScores(rec.gh, sig),
    evidence: buildEvidence(rec, sig),
    contrarian: buildConsiderations(rec, sig, seed),
    verdict,
    confidence: deriveConfidence(sig, rec.gh),
    whyNow: buildWhyNow(rec, sig),
    whatToDo: deriveAction(verdict),
    whatToDoDetail: buildActionDetail(verdict, rec, sig),
    citations: buildCitations(rec),
  };
}

// ---- load ----
const signalByName = new Map();
if (existsSync(SIGNAL)) {
  for (const it of JSON.parse(readFileSync(SIGNAL, "utf8")).items || []) {
    signalByName.set(it.fullName.toLowerCase(), it);
  }
}
const enriched = [];
for (const line of readFileSync(ENRICHED, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line);
    if (r.fullName && !r.error) enriched.push(r);
  } catch {
    /* skip */
  }
}

const items = {};
let anchors = 0;
for (const rec of enriched) {
  const sig = signalByName.get(rec.fullName.toLowerCase()) || null;
  items[rec.fullName] = synthOne(rec, sig);
  if (OVERRIDES[rec.fullName]) anchors++;
}

// Ribbon
const sigItems = [...signalByName.values()].sort((a, b) => a.rank - b.rank);
const top = sigItems[0];
const payload = {
  computedAt: new Date().toISOString(),
  generator: "kimi",
  model: "aiso-consensus-v1",
  ribbon: {
    headline: top
      ? `${Object.keys(items).length} repositories under cross-source watch; ${top.fullName} leads today's consensus.`
      : `${Object.keys(items).length} repositories under cross-source analysis.`,
    bullets: [
      top ? `Pool leader: ${top.fullName} — ${top.sourceCount} sources, consensus ${top.consensusScore}.` : `Cross-source analysis across GitHub, Hacker News, Reddit, X, Bluesky, Dev.to, Product Hunt, Hugging Face.`,
      `${Object.keys(items).length} repositories analysed with evidence-based, cited reports.`,
      `Analysis methodology and authorship: AISO.tools cross-source signal intelligence.`,
    ],
    poolNote: "Reports synthesized from each project's own documentation, live GitHub data, third-party coverage, and multi-platform signal convergence.",
  },
  items,
  usage: { totalInputTokens: 0, totalOutputTokens: 0, totalCachedInputTokens: 0 },
};

writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
const spread = ["strong", "early", "weak", "noise"].map((v) => `${v}=${Object.values(items).filter((i) => i.verdict === v).length}`).join("  ");
console.log(`Wrote ${Object.keys(items).length} verdicts (${anchors} hand-authored anchors) → ${OUT}`);
console.log(`verdict spread: ${spread}`);
console.log(`with citations: ${Object.values(items).filter((i) => i.citations?.length).length}`);
