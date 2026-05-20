// parseOverview — markdown body splitter for /ideas/[id] Overview tab.
//
// The mockup (ideas-detail.html) shows the Overview tab with 4 structured
// sections: "What is this?", "Why now?", "Evidence snapshot", and
// "Suggested MVP" (3 columns: Must have / Later / Do not build).
//
// Rather than introduce schema fields per section (which would require a DB
// migration and prompt every claimant to fill 4 new boxes), this helper
// parses the existing `idea.body` markdown by looking for case-insensitive
// `## What is this`, `## Why now`, `## Evidence`, `## MVP` headings.
//
// Inside the MVP block, three sub-headings split the columns:
//   - Must have / Must-have / Build now → mustHave[]
//   - Later / Could → later[]
//   - Do not build / Nope / Won't / Skip → nope[]
//
// Bullets inside each section are extracted as string entries (markdown `-`,
// `*`, or `+` prefix). Paragraph-style text is concatenated into the section
// summary instead.
//
// Returns a partial — every field may be absent. Consumers MUST render an
// deterministic display copy per absent section so the four mockup blocks
// always remain visible.

export interface OverviewMvp {
  mustHave: string[];
  later: string[];
  nope: string[];
}

export interface ParsedOverview {
  whatIsThis?: string;
  whyNow?: string;
  evidence?: string[];
  mvp?: OverviewMvp;
}

// Heading recognizers — order matters: more specific patterns first.
const HEADING_PATTERNS: Array<{
  key: "whatIsThis" | "whyNow" | "evidence" | "mvp";
  re: RegExp;
}> = [
  { key: "whatIsThis", re: /^#{1,3}\s*what\s+is\s+this\b.*$/i },
  { key: "whyNow", re: /^#{1,3}\s*why\s+now\b.*$/i },
  { key: "evidence", re: /^#{1,3}\s*evidence(\s+snapshot)?\b.*$/i },
  { key: "mvp", re: /^#{1,3}\s*(suggested\s+)?mvp\b.*$/i },
];

const MVP_BUCKETS: Array<{
  bucket: keyof OverviewMvp;
  re: RegExp;
}> = [
  { bucket: "mustHave", re: /^#{1,4}\s*(must[-\s]?have|build\s+now)\b.*$/i },
  { bucket: "later", re: /^#{1,4}\s*(later|could|nice[-\s]?to[-\s]?have)\b.*$/i },
  {
    bucket: "nope",
    re: /^#{1,4}\s*(do\s+not\s+build|nope|won['’]?t|skip|out\s+of\s+scope)\b.*$/i,
  },
];

const BULLET_RE = /^\s*[-*+]\s+(.*)\s*$/;

function classifyHeading(
  line: string,
): "whatIsThis" | "whyNow" | "evidence" | "mvp" | null {
  if (!line.startsWith("#")) return null;
  for (const { key, re } of HEADING_PATTERNS) {
    if (re.test(line)) return key;
  }
  return null;
}

function classifyMvpBucket(line: string): keyof OverviewMvp | null {
  if (!line.startsWith("#")) return null;
  for (const { bucket, re } of MVP_BUCKETS) {
    if (re.test(line)) return bucket;
  }
  return null;
}

function collectBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(BULLET_RE);
    if (m) {
      const text = m[1].trim();
      if (text) out.push(text);
    }
  }
  return out;
}

function joinParagraphs(lines: string[]): string {
  return lines
    .filter((l) => !BULLET_RE.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse an idea body into structured Overview sections.
 *
 * Returns a partial object — fields are only populated when the
 * corresponding heading is present in the body. Sections without a
 * heading still keeps its section visible in the UI.
 */
export function parseOverview(body: string | null | undefined): ParsedOverview {
  if (!body || typeof body !== "string") return {};

  const lines = body.split(/\r?\n/);
  const sections: Record<"whatIsThis" | "whyNow" | "evidence" | "mvp", string[]> = {
    whatIsThis: [],
    whyNow: [],
    evidence: [],
    mvp: [],
  };

  let current: keyof typeof sections | null = null;

  for (const rawLine of lines) {
    const heading = classifyHeading(rawLine);
    if (heading) {
      current = heading;
      continue;
    }
    if (current) {
      sections[current].push(rawLine);
    }
  }

  const out: ParsedOverview = {};

  const wt = joinParagraphs(sections.whatIsThis);
  if (wt) out.whatIsThis = wt;

  const wn = joinParagraphs(sections.whyNow);
  if (wn) out.whyNow = wn;

  const ev = collectBullets(sections.evidence);
  // If no bullets in evidence but there's prose, split sentences as fallback.
  if (ev.length > 0) {
    out.evidence = ev;
  } else {
    const prose = joinParagraphs(sections.evidence);
    if (prose) {
      const sentences = prose
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sentences.length > 0) out.evidence = sentences;
    }
  }

  // Parse MVP block by sub-heading buckets.
  if (sections.mvp.length > 0) {
    const mvpBuckets: OverviewMvp = { mustHave: [], later: [], nope: [] };
    let activeBucket: keyof OverviewMvp | null = null;
    const bucketLines: Record<keyof OverviewMvp, string[]> = {
      mustHave: [],
      later: [],
      nope: [],
    };

    for (const rawLine of sections.mvp) {
      const bucket = classifyMvpBucket(rawLine);
      if (bucket) {
        activeBucket = bucket;
        continue;
      }
      if (activeBucket) bucketLines[activeBucket].push(rawLine);
    }

    mvpBuckets.mustHave = collectBullets(bucketLines.mustHave);
    mvpBuckets.later = collectBullets(bucketLines.later);
    mvpBuckets.nope = collectBullets(bucketLines.nope);

    if (
      mvpBuckets.mustHave.length > 0 ||
      mvpBuckets.later.length > 0 ||
      mvpBuckets.nope.length > 0
    ) {
      out.mvp = mvpBuckets;
    }
  }

  return out;
}
