// Cross-domain join resolver tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attachCrossDomainJoins,
  buildPaperGraph,
  getJoinsForRepo,
  __test,
  type ArxivPaperJoinInput,
  type HfModelJoinInput,
} from "../cross-domain-joins";

const { bareArxivId, arxivTagsOf, repositoryTagsOf } = __test;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paper(
  arxivId: string,
  title: string,
  ...repos: string[]
): ArxivPaperJoinInput {
  return {
    arxivId,
    title,
    linkedRepos: repos.map((fullName) => ({ fullName })),
  };
}

function model(id: string, ...tags: string[]): HfModelJoinInput {
  return { id, tags };
}

function repo(fullName: string) {
  return { fullName };
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

test("bareArxivId strips version suffix", () => {
  assert.equal(bareArxivId("2604.24758v1"), "2604.24758");
  assert.equal(bareArxivId("2604.24758v12"), "2604.24758");
  assert.equal(bareArxivId("2604.24758"), "2604.24758");
});

test("arxivTagsOf extracts arxiv: tags and strips versions", () => {
  assert.deepEqual(
    arxivTagsOf(["transformers", "arxiv:2604.20796", "license:mit"]),
    ["2604.20796"],
  );
  assert.deepEqual(arxivTagsOf(["arxiv:2604.20796v3"]), ["2604.20796"]);
  assert.deepEqual(arxivTagsOf(undefined), []);
  assert.deepEqual(arxivTagsOf([]), []);
});

test("repositoryTagsOf extracts repository: tags only when shaped owner/name", () => {
  assert.deepEqual(
    repositoryTagsOf([
      "repository:vercel/next.js",
      "repository:bare",
      "transformers",
    ]),
    ["vercel/next.js"],
  );
  assert.deepEqual(repositoryTagsOf(undefined), []);
});

// ---------------------------------------------------------------------------
// buildPaperGraph
// ---------------------------------------------------------------------------

test("buildPaperGraph: empty inputs → empty graph", () => {
  const g = buildPaperGraph([], []);
  assert.equal(g.size, 0);
});

test("buildPaperGraph: paper with two linked repos puts both in entry", () => {
  const g = buildPaperGraph(
    [paper("2604.0001", "T1", "vercel/next.js", "facebook/react")],
    [],
  );
  // Both bare and versionless forms point to the same entry (here arxivId
  // has no version, so only one key — but graph.size counts unique keys).
  const e = g.get("2604.0001");
  assert.ok(e, "entry must exist");
  assert.deepEqual(e!.linkedRepos, ["vercel/next.js", "facebook/react"]);
  assert.deepEqual(e!.linkedHfModels, []);
});

test("buildPaperGraph: versioned arxivId is reachable by both bare and versioned key", () => {
  const g = buildPaperGraph(
    [paper("2604.0002v1", "T2", "owner/repo")],
    [],
  );
  const a = g.get("2604.0002");
  const b = g.get("2604.0002v1");
  assert.ok(a && b, "both keys resolve");
  assert.equal(a, b, "both keys point to the same entry object");
  assert.equal(a!.arxivId, "2604.0002", "stored arxivId is the bare form");
});

test("buildPaperGraph: HF model arxiv tag attaches to matching paper entry", () => {
  const g = buildPaperGraph(
    [paper("2604.0003", "T3", "owner/repo")],
    [model("acme/llm", "transformers", "arxiv:2604.0003")],
  );
  assert.deepEqual(g.get("2604.0003")!.linkedHfModels, ["acme/llm"]);
});

test("buildPaperGraph: HF model whose arxiv tag matches no paper is silently ignored", () => {
  const g = buildPaperGraph(
    [paper("2604.0004", "T4", "owner/repo")],
    [model("acme/zzz", "arxiv:9999.9999")],
  );
  assert.deepEqual(g.get("2604.0004")!.linkedHfModels, []);
  assert.equal(g.get("9999.9999"), undefined);
});

test("buildPaperGraph: untracked repo in paper.linkedRepos is preserved", () => {
  // The renderer treats "untracked" repos as plaintext discovery signal.
  const g = buildPaperGraph(
    [paper("2604.0005", "T5", "unknown/lib", "tracked/repo")],
    [],
  );
  assert.deepEqual(g.get("2604.0005")!.linkedRepos, [
    "unknown/lib",
    "tracked/repo",
  ]);
});

test("buildPaperGraph: dedupes repeated repo references and HF references", () => {
  const g = buildPaperGraph(
    [
      paper("2604.0006", "T6", "owner/repo", "owner/repo"),
    ],
    [
      model("acme/m", "arxiv:2604.0006", "arxiv:2604.0006"),
    ],
  );
  assert.deepEqual(g.get("2604.0006")!.linkedRepos, ["owner/repo"]);
  assert.deepEqual(g.get("2604.0006")!.linkedHfModels, ["acme/m"]);
});

// ---------------------------------------------------------------------------
// attachCrossDomainJoins
// ---------------------------------------------------------------------------

test("attachCrossDomainJoins: empty graph → each repo gets empty arrays", () => {
  const out = attachCrossDomainJoins(
    [repo("a/b"), repo("c/d")],
    new Map(),
    [],
  );
  assert.deepEqual(out[0].linkedArxivIds, []);
  assert.deepEqual(out[0].linkedHfModels, []);
  assert.deepEqual(out[1].linkedArxivIds, []);
  assert.deepEqual(out[1].linkedHfModels, []);
});

test("attachCrossDomainJoins: paper with 2 repos → both get the arxivId", () => {
  const g = buildPaperGraph(
    [paper("2604.1000", "T", "vercel/next.js", "facebook/react")],
    [],
  );
  const out = attachCrossDomainJoins(
    [repo("vercel/next.js"), repo("facebook/react")],
    g,
    [],
  );
  assert.deepEqual(out[0].linkedArxivIds, ["2604.1000"]);
  assert.deepEqual(out[1].linkedArxivIds, ["2604.1000"]);
});

test("attachCrossDomainJoins: two papers, same repo → repo gets both arxivIds", () => {
  const g = buildPaperGraph(
    [
      paper("2604.2000", "P1", "owner/repo"),
      paper("2604.2001", "P2", "owner/repo"),
    ],
    [],
  );
  const out = attachCrossDomainJoins([repo("owner/repo")], g, []);
  assert.deepEqual(out[0].linkedArxivIds, ["2604.2000", "2604.2001"]);
});

test("attachCrossDomainJoins: HF model linked via paper → repo picks up hfModelId", () => {
  const g = buildPaperGraph(
    [paper("2604.3000", "P", "owner/repo")],
    [model("acme/llm", "arxiv:2604.3000")],
  );
  const out = attachCrossDomainJoins(
    [repo("owner/repo")],
    g,
    [model("acme/llm", "arxiv:2604.3000")],
  );
  assert.deepEqual(out[0].linkedArxivIds, ["2604.3000"]);
  assert.deepEqual(out[0].linkedHfModels, ["acme/llm"]);
});

test("attachCrossDomainJoins: best-effort repository: tag attaches HF directly", () => {
  const g = new Map();
  const out = attachCrossDomainJoins(
    [repo("vercel/next.js")],
    g,
    [model("acme/m", "repository:vercel/next.js")],
  );
  assert.deepEqual(out[0].linkedArxivIds, []);
  assert.deepEqual(out[0].linkedHfModels, ["acme/m"]);
});

test("attachCrossDomainJoins: repos with no joins receive empty arrays (not undefined)", () => {
  const g = buildPaperGraph(
    [paper("2604.4000", "P", "owner/repo")],
    [],
  );
  const out = attachCrossDomainJoins([repo("not/joined")], g, []);
  assert.equal(Array.isArray(out[0].linkedArxivIds), true);
  assert.equal(Array.isArray(out[0].linkedHfModels), true);
  assert.equal(out[0].linkedArxivIds.length, 0);
  assert.equal(out[0].linkedHfModels.length, 0);
});

test("attachCrossDomainJoins: multi-paper, multi-HF, mixed end-to-end", () => {
  const papers = [
    paper("2604.5000v1", "P1", "owner/a", "owner/b"),
    paper("2604.5001", "P2", "owner/b"),
    paper("2604.5002", "P3", "untracked/x"),
  ];
  const hf = [
    model("acme/m1", "arxiv:2604.5000"),
    model("acme/m2", "arxiv:2604.5001", "arxiv:2604.5002"),
    model("acme/m3", "license:mit"),
  ];
  const g = buildPaperGraph(papers, hf);
  const out = attachCrossDomainJoins(
    [repo("owner/a"), repo("owner/b")],
    g,
    hf,
  );

  // owner/a is on P1 only → arxiv 2604.5000, hf m1.
  assert.deepEqual(out[0].linkedArxivIds, ["2604.5000"]);
  assert.deepEqual(out[0].linkedHfModels, ["acme/m1"]);

  // owner/b is on P1+P2 → both arxivIds, models m1+m2.
  assert.deepEqual(out[1].linkedArxivIds, ["2604.5000", "2604.5001"]);
  assert.deepEqual(
    out[1].linkedHfModels.slice().sort(),
    ["acme/m1", "acme/m2"].sort(),
  );

  // untracked/x is referenced by P3 in the graph but not in repos input —
  // verify the graph entry still carries it (discovery signal).
  assert.deepEqual(g.get("2604.5002")!.linkedRepos, ["untracked/x"]);
});

// ---------------------------------------------------------------------------
// getJoinsForRepo
// ---------------------------------------------------------------------------

test("getJoinsForRepo returns the correct slice for a known repo", () => {
  const papers = [
    paper("2604.6000", "P1", "owner/repo"),
    paper("2604.6001", "P2", "owner/repo", "other/lib"),
  ];
  const hf = [model("acme/m", "arxiv:2604.6000")];
  const g = buildPaperGraph(papers, hf);

  const joins = getJoinsForRepo("owner/repo", g, hf);
  assert.deepEqual(joins.linkedArxivIds, ["2604.6000", "2604.6001"]);
  assert.deepEqual(joins.linkedHfModels, ["acme/m"]);
});

test("getJoinsForRepo returns empty arrays for an unknown repo", () => {
  const g = buildPaperGraph(
    [paper("2604.7000", "P", "owner/repo")],
    [],
  );
  const joins = getJoinsForRepo("nope/nada", g, []);
  assert.deepEqual(joins.linkedArxivIds, []);
  assert.deepEqual(joins.linkedHfModels, []);
});

test("getJoinsForRepo applies repository: tags as direct HF links", () => {
  const g = new Map();
  const hf = [model("acme/m", "repository:owner/repo")];
  const joins = getJoinsForRepo("owner/repo", g, hf);
  assert.deepEqual(joins.linkedHfModels, ["acme/m"]);
});
