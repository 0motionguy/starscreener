// Spam-gate precision tests. Positives are REAL repo names pulled from the live
// DISCOVERY/TREND tabs on 2026-07-05; negatives are legit repos whose names
// look superficially similar (security tooling, ML crack-detection, torrent
// clients) and MUST survive the filter.

import { test } from "node:test";
import assert from "node:assert/strict";

import { isSpamRepo, filterSpamRepos } from "../ranking/repo-quality";

const SPAM = [
  "Lairmoprosper/Pinnacle-Studio-26-Crack",
  "straitmonetarymark/PC-HelpSoft-Driver-Updater-cracked",
  "HelmsmanEstimate/Autodesk-Inventor-2026-cracked",
  "OrderGeomancerCairn/YouTube-Music-Premium-cracked",
  "noonhorseupgrade/Slate-Digital-VerbSuite-Classics-Crack",
  "squarefleacheer/Ispirer-Toolkit-Migrator-Crack-2026",
  "CourtBlazeExplode/Rust-Verdict-Cheats-Cracked-2026",
  "ero4ra-47/we-the-north-market-market-wethenorth-org",
  "someone/Office-2021-Pro-keygen",
  "vendor/AdobePhotoshop-nulled",
];

const LEGIT = [
  "Porchetta-Industries/CrackMapExec", // famous pentest tool
  "yhirose/surface-crack-detection", // ML
  "khanhha/crack_segmentation", // ML
  "hashcat/hashcat", // password recovery
  "webtorrent/webtorrent", // torrent client
  "anthropics/claude-code",
  "sxyazi/yazi",
  "twentyhq/twenty",
  "some-org/growth-hacking-toolkit",
  "org/hackathon-starter",
];

test("isSpamRepo flags every observed piracy/crack/darknet repo", () => {
  for (const fullName of SPAM) {
    assert.equal(isSpamRepo({ fullName, description: "" }), true, `missed spam: ${fullName}`);
  }
});

test("isSpamRepo spares legit look-alike repos (crack-detection, CrackMapExec, torrents)", () => {
  for (const fullName of LEGIT) {
    assert.equal(isSpamRepo({ fullName, description: "" }), false, `false positive: ${fullName}`);
  }
});

test("isSpamRepo catches clean-named spam via piracy description phrases", () => {
  assert.equal(
    isSpamRepo({
      fullName: "user/media-suite",
      description: "Full version free download with activation key included. Cracked software.",
    }),
    true,
  );
});

test("isSpamRepo does not flag a legit repo that merely mentions cracks", () => {
  assert.equal(
    isSpamRepo({
      fullName: "research/pavement-ai",
      description: "Deep learning for surface crack detection in concrete and pavement imagery.",
    }),
    false,
  );
});

test("filterSpamRepos drops spam and preserves order of the rest", () => {
  const repos = [
    { fullName: "anthropics/claude-code", description: "" },
    { fullName: "Lairmoprosper/Pinnacle-Studio-26-Crack", description: "" },
    { fullName: "sxyazi/yazi", description: "" },
  ];
  const out = filterSpamRepos(repos);
  assert.deepEqual(
    out.map((r) => r.fullName),
    ["anthropics/claude-code", "sxyazi/yazi"],
  );
});
