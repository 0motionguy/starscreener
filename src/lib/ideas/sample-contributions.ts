// Sample contributions seed for /ideas/[id] Contributions tab.
//
// Until persistent contributions land (backend stub at /api/ideas/[id]/contributions),
// the tab renders these 5 sample shapes with a banner: "Sample contributions —
// your post will replace these once a real one lands." This keeps the surface
// alive in the mockup-faithful sense rather than rendering an honest-but-bare
// empty state.
//
// Tone: matches mockup ideas-detail.html:1196-1265. The 8 contribution types
// align with the 8-type composer chip row (Comment / Evidence / Repo / Feature /
// Workaround / Project / I'd use this / I'd build this).

export type ContributionType =
  | "comment"
  | "evidence"
  | "repo"
  | "feature"
  | "workaround"
  | "project"
  | "i-would-use"
  | "i-would-build";

export interface SampleContribution {
  id: string;
  authorName: string;
  authorHandle: string;
  /** Gradient tone 1-5 for the avatar swatch (matches .contribution-avatar.b1-b5). */
  avatarTone: 1 | 2 | 3 | 4 | 5;
  type: ContributionType;
  body: string;
  /** Pre-active reactions on this contribution (mockup shows some reactions
   *  pre-lit so the UI doesn't look freshly-empty). */
  reactions: {
    fire?: number;
    bulb?: number;
    rocket?: number;
    target?: number;
    check?: number;
    money?: number;
  };
  /** Relative time label (e.g. "2h", "5h", "1d"). Hardcoded for the seed so
   *  it doesn't drift with the clock. */
  timeAgoLabel: string;
}

export const SAMPLE_CONTRIBUTIONS: SampleContribution[] = [
  {
    id: "sample-1",
    authorName: "Avery Kim",
    authorHandle: "@averykim",
    avatarTone: 1,
    type: "evidence",
    body:
      "Saw 3 separate teams in our Discord ask for this last week. Filed the use cases at " +
      "github.com/example/discussions/142 — most overlap on the 'hosted dashboard' angle.",
    reactions: { bulb: 8, fire: 2 },
    timeAgoLabel: "2h",
  },
  {
    id: "sample-2",
    authorName: "Mara Diaz",
    authorHandle: "@maradiaz",
    avatarTone: 3,
    type: "feature",
    body:
      "Strong +1. Would also love an export step — CSV / Parquet drop so I can post-process " +
      "downstream. Doesn't need to be in v1 but flag-able as Phase 2.",
    reactions: { rocket: 5, check: 3 },
    timeAgoLabel: "5h",
  },
  {
    id: "sample-3",
    authorName: "Theo Rune",
    authorHandle: "@theorune",
    avatarTone: 2,
    type: "workaround",
    body:
      "Currently piping through n8n + a Make.com webhook chain. Works, but the latency budget " +
      "blows past 4s on cold-miss days. A first-party version would crush this.",
    reactions: { target: 4, fire: 1 },
    timeAgoLabel: "9h",
  },
  {
    id: "sample-4",
    authorName: "Lin Wu",
    authorHandle: "@linwu",
    avatarTone: 5,
    type: "i-would-build",
    body:
      "Happy to claim the back-end half if someone takes the dashboard. Have spare cycles " +
      "Thursday afternoon. DM me on X if interested.",
    reactions: { check: 6, money: 2 },
    timeAgoLabel: "12h",
  },
  {
    id: "sample-5",
    authorName: "Sam Holt",
    authorHandle: "@samholt",
    avatarTone: 4,
    type: "repo",
    body:
      "Closest prior art I found: github.com/anthropics/anthropic-cookbook (the eval/ folder). " +
      "Worth reading their assumption tree before re-deriving.",
    reactions: { bulb: 3 },
    timeAgoLabel: "1d",
  },
];

/**
 * Human-readable label for a contribution type. Matches the 8 composer chips.
 */
export const CONTRIBUTION_TYPE_LABEL: Record<ContributionType, string> = {
  comment: "Comment",
  evidence: "Evidence",
  repo: "Repo",
  feature: "Feature",
  workaround: "Workaround",
  project: "Project",
  "i-would-use": "I'd use this",
  "i-would-build": "I'd build this",
};
