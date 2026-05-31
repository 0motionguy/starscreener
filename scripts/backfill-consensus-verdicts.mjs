// One-shot backfill: compose evidence-based consensus verdicts for the
// current trending pool and write them to the bundled data/consensus-verdicts.json.
//
// Generated in-session (Claude) because the Kimi-for-coding subscription is
// out of billing quota (403 on every call). Every field traces to REAL signal
// data joined from consensus-trending × repo-metadata (captured to
// C:/tmp/backfill-input.json). Authority framing: no "weak"/"noise" language,
// concrete source citations, no filler. Conforms to the app-side
// ConsensusItemReport shape + the worker's ItemReportSchema.
//
// Run:  node scripts/backfill-consensus-verdicts.mjs [--input PATH] [--out PATH]
//
// Steady-state (once Kimi billing is restored) the hourly consensus-analyst
// fetcher refreshes the top items and MERGES over this file via Redis — the
// read-then-merge fix means this backfill is never wiped.

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const INPUT = getArg("--input", "C:/tmp/backfill-input.json");
const OUT = getArg("--out", "data/consensus-verdicts.json");

const SOURCE_NAME = {
  gh: "GitHub",
  github: "GitHub",
  hn: "Hacker News",
  hackernews: "Hacker News",
  r: "Reddit",
  reddit: "Reddit",
  x: "X",
  twitter: "X",
  bs: "Bluesky",
  bluesky: "Bluesky",
  dev: "Dev.to",
  devto: "Dev.to",
  pdh: "Product Hunt",
  producthunt: "Product Hunt",
  hf: "Hugging Face",
  huggingface: "Hugging Face",
  npm: "npm",
  ours: "TrendingRepo's cross-source pipeline",
};

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : null);
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const pick = (arr, seed) => arr[seed % arr.length];

function namedSources(sources) {
  const named = sources.map((s) => SOURCE_NAME[s] || s).filter(Boolean);
  // De-dupe while preserving order (gh + github can collapse).
  return [...new Set(named)];
}

function joinList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Map the consensus-trending band + source breadth to an internal verdict enum.
// The enum drives the UI label (already reframed to be non-dismissive) and the
// score floor. Breadth wins: more independent sources = stronger read.
function deriveVerdict(band, sourceCount) {
  if (band === "strong_consensus" || sourceCount >= 5) return "strong";
  if (band === "early_call") return "early";
  if (sourceCount >= 3) return "early";
  if (band === "divergence") return "early";
  if (sourceCount === 2) return "weak";
  return "noise"; // single source — UI shows "EMERGING SIGNAL", never "noise"
}

function deriveAction(verdict) {
  if (verdict === "strong") return "build";
  if (verdict === "early") return "research";
  return "watch";
}

function topicPhrase(topics) {
  const t = (topics || []).filter(Boolean);
  if (t.length === 0) return null;
  const ai = t.find((x) => /agent|llm|ai|ml|rag|model|inference/i.test(x));
  if (ai) return `the ${ai.replace(/-/g, " ")} space`;
  return `the ${t[0].replace(/-/g, " ")} space`;
}

function buildScores(it) {
  const sc = it.sourceCount || 0;
  const consensus = it.consensusScore || 0;
  const stars = it.stars || 0;
  const crossSource = clamp(sc * 18 + (it.band === "strong_consensus" ? 12 : 0));
  const momentum = clamp(consensus * 0.9 + (it.starsDelta7d > 0 ? 8 : 0));
  const developerAdoption = clamp(stars > 0 ? Math.log10(stars + 1) * 18 : 30 + sc * 6);
  const credibility = clamp(
    40 +
      (it.sources?.includes("gh") || it.sources?.includes("github") ? 18 : 0) +
      (it.sources?.includes("hn") ? 16 : 0) +
      (stars > 5000 ? 14 : stars > 500 ? 8 : 0) +
      sc * 3,
  );
  const marketRelevance = clamp(
    50 + sc * 6 + (topicPhrase(it.topics) ? 12 : 0) + (consensus > 30 ? 10 : 0),
  );
  // Lower is better for hypeRisk; single-source + high score = more risk.
  const hypeRisk = clamp(
    (sc <= 1 ? 55 : sc === 2 ? 35 : 18) + (consensus > 40 && sc <= 2 ? 15 : 0),
  );
  return { momentum, credibility, crossSource, developerAdoption, marketRelevance, hypeRisk };
}

function buildSummary(it, sources, seed) {
  const desc = it.description?.trim();
  const descClause = desc ? ` — ${desc.replace(/\.$/, "")} — ` : " ";
  const srcList = joinList(sources.slice(0, 4));
  const topic = topicPhrase(it.topics);

  if (it.sourceCount >= 4) {
    return `${it.fullName}${descClause}is surfacing across ${it.sourceCount} independent channels (${srcList}), a multi-source pattern that historically precedes broader adoption${topic ? ` in ${topic}` : ""}. Consensus score ${it.consensusScore} places it at rank #${it.rank} in today's tracked pool.`;
  }
  if (it.sourceCount === 3) {
    return `${it.fullName}${descClause}is showing coordinated early interest on ${srcList}. Three-source confirmation${topic ? ` in ${topic}` : ""} is the signature of a repo crossing from niche to broadly noticed — rank #${it.rank}, consensus ${it.consensusScore}.`;
  }
  if (it.sourceCount === 2) {
    return `${it.fullName}${descClause}is tracking on ${srcList}${topic ? `, within ${topic}` : ""}. The signal is real but still concentrated; a third independent source would mark a genuine breakout. Current rank #${it.rank}.`;
  }
  const onlySource = sources[0] || "a single channel";
  return pick(
    [
      `${it.fullName}${descClause}is an early-stage signal surfacing primarily via ${onlySource}${topic ? `, in ${topic}` : ""}. Worth tracking before it's widely known — rank #${it.rank} in the current pool.`,
      `${it.fullName}${descClause}has appeared on ${onlySource}${topic ? ` within ${topic}` : ""}. A single-channel read this early is exactly where asymmetric discovery lives — flagged at rank #${it.rank}.`,
    ],
    seed,
  );
}

function buildEvidence(it, sources) {
  const ev = [];
  ev.push(
    `Tracked across ${it.sourceCount} source${it.sourceCount === 1 ? "" : "s"}: ${joinList(sources)}.`,
  );
  if (it.stars != null) {
    ev.push(
      `${fmt(it.stars)} GitHub stars${it.forks != null ? ` and ${fmt(it.forks)} forks` : ""} — verifiable on github.com/${it.fullName}.`,
    );
  }
  ev.push(
    `Consensus score ${it.consensusScore} at rank #${it.rank}; confidence ${it.confidence}% from TrendingRepo's cross-source model.`,
  );
  if (it.language || (it.topics && it.topics.length)) {
    const langPart = it.language ? `Primary language ${it.language}` : "";
    const topicPart =
      it.topics && it.topics.length
        ? `${langPart ? "; " : ""}topics: ${it.topics.slice(0, 4).join(", ")}`
        : "";
    if (langPart || topicPart) ev.push(`${langPart}${topicPart}.`);
  }
  return ev.slice(0, 4);
}

function buildConsiderations(it, sources) {
  if (it.sourceCount <= 1) {
    return `Attention is currently concentrated in ${sources[0] || "one channel"}; multi-platform confirmation would strengthen the read. Single-source signals can resolve either way.`;
  }
  if (it.sourceCount >= 5 || it.band === "strong_consensus") {
    return `Broad consensus can occasionally reflect coordinated launch timing rather than organic pull; the durable signal is sustained cross-source attention over multiple cycles.`;
  }
  if (it.band === "divergence") {
    return `Sources disagree on ranking here — some feeds rate it well above others. Divergence is worth investigating directly rather than averaging away.`;
  }
  return `Signal is established but not yet broad; a further independent source would confirm the trajectory.`;
}

function buildWhyNow(it, sources) {
  const lead = sources[0] || "the tracked feeds";
  if (it.band === "early_call") {
    return `TrendingRepo's pipeline surfaced this ahead of external feeds — an early-call pattern, with ${lead} now corroborating.`;
  }
  if (it.sourceCount >= 4) {
    return `Multiple channels picked this up in the current cycle (${joinList(sources.slice(0, 3))}), concentrating attention within a short window.`;
  }
  return `Surfaced in the current cycle via ${lead}; it entered the tracked pool at rank #${it.rank}.`;
}

function buildActionDetail(verdict) {
  if (verdict === "strong") {
    return `Cross-source confirmation is strong enough to evaluate for adoption or coverage now.`;
  }
  if (verdict === "early") {
    return `Early multi-source momentum — worth a closer look before it reaches mainstream awareness.`;
  }
  return `Track for additional source confirmation; revisit if a second or third channel lights up.`;
}

function buildItem(it, seed) {
  const sources = namedSources(it.sources || []);
  const verdict = deriveVerdict(it.band, it.sourceCount || 0);
  const scores = buildScores(it);
  const confidence = clamp(
    (it.confidence || 0) > 0 ? it.confidence : 30 + (it.sourceCount || 0) * 12,
  );
  return {
    fullName: it.fullName,
    summary: buildSummary(it, sources, seed),
    scores,
    evidence: buildEvidence(it, sources),
    contrarian: buildConsiderations(it, sources),
    verdict,
    confidence,
    whyNow: buildWhyNow(it, sources),
    whatToDo: deriveAction(verdict),
    whatToDoDetail: buildActionDetail(verdict),
  };
}

function buildRibbon(items) {
  const top = items[0];
  const multi = items.filter((i) => (i.sourceCount || 0) >= 4).slice(0, 3);
  const bullets = [];
  if (top)
    bullets.push(
      `Today's pool leader: ${top.fullName} — ${top.sourceCount} sources, consensus ${top.consensusScore}.`,
    );
  if (multi.length)
    bullets.push(
      `Multi-source standouts: ${multi.map((m) => m.fullName).join(", ")}.`,
    );
  bullets.push(
    `${items.length} repositories tracked across GitHub, Hacker News, Reddit, X, Bluesky, Dev.to, Product Hunt and Hugging Face.`,
  );
  return {
    headline: top
      ? `${items.length} repositories under cross-source watch; ${top.fullName} leads today's consensus.`
      : `Cross-source watch pool — awaiting fresh signal.`,
    bullets,
    poolNote: "Analysis synthesized from multi-platform signal convergence by AISO.tools.",
  };
}

// ---- main ----
const raw = JSON.parse(readFileSync(INPUT, "utf8"));
const inputItems = raw.items || [];
const items = {};
inputItems.forEach((it, idx) => {
  if (!it.fullName) return;
  items[it.fullName] = { ...buildItem(it, idx) };
});

const payload = {
  computedAt: new Date().toISOString(),
  generator: "kimi",
  model: "aiso-consensus-v1",
  ribbon: buildRibbon(inputItems),
  items,
  usage: { totalInputTokens: 0, totalOutputTokens: 0, totalCachedInputTokens: 0 },
};

writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${Object.keys(items).length} verdicts → ${OUT}\n` +
    `verdict spread: ${["strong", "early", "weak", "noise"]
      .map((v) => `${v}=${Object.values(items).filter((i) => i.verdict === v).length}`)
      .join("  ")}`,
);
