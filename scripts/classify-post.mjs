// Content-type classifier for social posts (Reddit + HackerNews).
//
// Zero dependencies, pure function, regex + keyword match only.
// The scraper passes raw post fields in and persists the returned
// content_tags + value_score on every stored post.
//
// Platform-neutral by default. Pass `platform: "hn"` to enable the
// HN-prefix rules (Show HN / Ask HN / Launch HN). Reddit callers
// omit the field, so their classification output is unchanged.

const BODY_SCAN_LIMIT = 1000;

export const CONTENT_TAGS = /** @type {const} */ ([
  "has-github-repo",
  "has-md-file",
  "has-code-block",
  "has-prompt",
  "has-mcp",
  "has-cli",
  "has-skill",
  "has-agent",
  "has-tutorial",
  "is-question",
  "is-meme",
  "is-news",
  "is-announcement",
  "is-show-hn",
  "is-ask-hn",
  "is-launch-hn",
]);

export const VALUE_TAGS = new Set([
  "has-github-repo",
  "has-md-file",
  "has-code-block",
  "has-prompt",
  "has-mcp",
  "has-cli",
  "has-skill",
  "has-agent",
  "has-tutorial",
  "is-announcement",
  "is-news",
]);

// HN tags carry +2 weight (mission spec): Show/Ask/Launch HN are
// deliberate dev content, worth more than a generic value tag.
export const HN_HIGH_VALUE_TAGS = new Set([
  "is-show-hn",
  "is-ask-hn",
  "is-launch-hn",
]);

const SHOW_HN_RE = /^show hn[:\s]/i;
const ASK_HN_RE = /^ask hn[:\s]/i;
const LAUNCH_HN_RE = /^launch hn[:\s]/i;

const NEWS_DOMAINS = [
  "techcrunch.com",
  "venturebeat.com",
  "theverge.com",
  "arstechnica.com",
  "wired.com",
  "theinformation.com",
  "bloomberg.com",
  "reuters.com",
  "axios.com",
  "semafor.com",
];

const REPO_URL_RE = /github\.com\/[\w-]+\/[\w.-]+/i;
const MD_FILE_URL_RE = /\.md(?:[?#].*)?$/i;
const MD_HEADER_RE = /^#{1,3}\s+/gm;
const CODE_FENCE_RE = /```/;
const INDENTED_CODE_RE = /^ {4}\S.*$/gm;
const QUESTION_START_RE = /^(how|why|what|is|can|should|does|anyone|any)\b/i;
const NEED_HELP_RE = /^need help\b/i;
const MEME_FLAIR_RE = /meme|funny|humor|shitpost/i;
const MEME_TITLE_RE = /\blol\b|we'?re\s+(so\s+)?cooked/i;
const IMAGE_OR_VIDEO_RE = /\.(jpg|png|gif|mp4)(?:[?#].*)?$/i;
const REDDIT_MEDIA_HOST_RE = /^https?:\/\/(?:i|v)\.redd\.it\//i;
const ANNOUNCEMENT_TITLE_RE =
  /\b(v?\d+\.\d+|launched|released|announcing|introducing|new)\b/i;
const STEP_RE = /step\s+\d+/i;
const NUMBERED_LIST_RE = /^\d+\.\s+/gm;
const NUMBERED_HEADER_RE = /##\s+\d/;

const PROMPT_PATTERNS = [
  /system:\s*["\n]/i,
  /you are (a|an)\s+\w+/i,
  /\[ROLE\]/i,
  /###\s*(instructions|role|task)/i,
];

const MCP_PATTERNS = [
  /mcp-server/i,
  /mcp server/i,
  /model context protocol/i,
  /claude_desktop_config/i,
  /\.mcp\.json/i,
  /mcp\.config/i,
];

const CLI_PATTERNS = [
  /\$\s*npm\b/,
  /\$\s*pip\b/,
  /\$\s*npx\b/,
  /\$\s*uvx\b/,
  /brew install/,
  /cargo install/,
];

const SKILL_PATTERNS = [
  /agent skill/i,
  /claude skill/i,
  /skill\.md/i,
  /\/skills\//i,
];

const AGENT_PATTERNS = [
  /agent framework/i,
  /autonomous agent/i,
  /ai agent/i,
  /multi-agent/i,
  /subagent/i,
];

function asString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeInput(input = {}) {
  const title = asString(input.title);
  const selftext = asString(input.selftext);
  const url = asString(input.url);
  const linkFlairText =
    input.linkFlairText == null ? null : asString(input.linkFlairText);
  const platform = input.platform === "hn" ? "hn" : "reddit";

  return {
    title,
    selftext,
    scannedSelftext: selftext.slice(0, BODY_SCAN_LIMIT),
    selftextLength: selftext.length,
    url,
    linkFlairText,
    platform,
  };
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function hasCodeBlock(post) {
  return (
    CODE_FENCE_RE.test(post.scannedSelftext) ||
    countMatches(post.scannedSelftext, INDENTED_CODE_RE) >= 5
  );
}

function isImageOrVideoUrl(url) {
  if (!url) return false;
  return IMAGE_OR_VIDEO_RE.test(url) || REDDIT_MEDIA_HOST_RE.test(url);
}

function isNewsUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return NEWS_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function classifyHasGithubRepo(post) {
  return REPO_URL_RE.test(
    `${post.title}\n${post.scannedSelftext}\n${post.url}`,
  );
}

function classifyHasMdFile(post) {
  if (MD_FILE_URL_RE.test(post.url)) return true;
  if (!post.scannedSelftext) return false;
  if (/^#{1,3}\s+/.test(post.scannedSelftext)) return true;
  return countMatches(post.scannedSelftext, MD_HEADER_RE) >= 3;
}

function classifyHasPrompt(post) {
  if (post.selftextLength > 500) {
    for (const pattern of PROMPT_PATTERNS) {
      if (pattern.test(post.scannedSelftext)) return true;
    }
  }
  return /\bprompt\b/i.test(post.title) && post.selftextLength > 300;
}

function classifyHasMcp(post) {
  const blob = `${post.title}\n${post.scannedSelftext}`;
  return MCP_PATTERNS.some((pattern) => pattern.test(blob));
}

function classifyHasCli(post) {
  if (CLI_PATTERNS.some((pattern) => pattern.test(post.scannedSelftext))) {
    return true;
  }
  return /\bCLI\b/.test(post.title) && hasCodeBlock(post);
}

function classifyHasSkill(post) {
  const blob = `${post.title}\n${post.scannedSelftext}`;
  return SKILL_PATTERNS.some((pattern) => pattern.test(blob));
}

function classifyHasAgent(post) {
  const blob = `${post.title}\n${post.scannedSelftext}`;
  return AGENT_PATTERNS.some((pattern) => pattern.test(blob));
}

function classifyHasTutorial(post) {
  if (post.selftextLength <= 1500) return false;
  if (STEP_RE.test(post.selftext)) return true;
  if (countMatches(post.selftext, NUMBERED_LIST_RE) >= 3) return true;
  return NUMBERED_HEADER_RE.test(post.selftext);
}

function classifyIsQuestion(post) {
  const title = post.title.trim();
  if (!title) return false;
  if (title.endsWith("?")) return true;
  return QUESTION_START_RE.test(title) || NEED_HELP_RE.test(title);
}

function classifyIsMeme(post) {
  if (post.linkFlairText && MEME_FLAIR_RE.test(post.linkFlairText)) return true;
  if (isImageOrVideoUrl(post.url)) return true;

  const emptyBody = post.selftext.trim().length === 0;
  if (!emptyBody) return false;

  if (MEME_TITLE_RE.test(post.title)) return true;
  return /^when\b/i.test(post.title.trim());
}

function classifyIsAnnouncement(post) {
  return post.selftextLength > 200 && ANNOUNCEMENT_TITLE_RE.test(post.title);
}

function classifyIsShowHn(post) {
  return post.platform === "hn" && SHOW_HN_RE.test(post.title);
}

function classifyIsAskHn(post) {
  return post.platform === "hn" && ASK_HN_RE.test(post.title);
}

function classifyIsLaunchHn(post) {
  return post.platform === "hn" && LAUNCH_HN_RE.test(post.title);
}

const CLASSIFIERS = [
  ["has-github-repo", classifyHasGithubRepo],
  ["has-md-file", classifyHasMdFile],
  ["has-code-block", hasCodeBlock],
  ["has-prompt", classifyHasPrompt],
  ["has-mcp", classifyHasMcp],
  ["has-cli", classifyHasCli],
  ["has-skill", classifyHasSkill],
  ["has-agent", classifyHasAgent],
  ["has-tutorial", classifyHasTutorial],
  ["is-question", classifyIsQuestion],
  ["is-meme", classifyIsMeme],
  ["is-news", (post) => isNewsUrl(post.url)],
  ["is-announcement", classifyIsAnnouncement],
  ["is-show-hn", classifyIsShowHn],
  ["is-ask-hn", classifyIsAskHn],
  ["is-launch-hn", classifyIsLaunchHn],
];

/**
 * Classify a Reddit post using title + url + body heuristics.
 * Most lexical rules scan the first 1000 chars of selftext; length-based
 * rules still use the full body length so tutorial/announcement gates work.
 *
 * @param {{
 *   title?: string,
 *   selftext?: string | null,
 *   url?: string,
 *   linkFlairText?: string | null,
 * }} input
 * @returns {{ content_tags: string[], value_score: number }}
 */
export function classifyPost(input) {
  const post = normalizeInput(input);
  const content_tags = [];

  for (const [tag, classifier] of CLASSIFIERS) {
    if (classifier(post)) content_tags.push(tag);
  }

  let value_score = 0;
  for (const tag of content_tags) {
    if (VALUE_TAGS.has(tag)) value_score += 1;
    if (HN_HIGH_VALUE_TAGS.has(tag)) value_score += 2;
  }
  if (content_tags.includes("is-meme")) value_score -= 1;

  return { content_tags, value_score };
}

/**
 * Ensure a stored Reddit post object carries content_tags + value_score.
 * Existing fields win so repeated merges stay stable.
 *
 * @template T
 * @param {T & {
 *   title?: string,
 *   selftext?: string | null,
 *   url?: string,
 *   linkFlairText?: string | null,
 *   content_tags?: string[],
 *   value_score?: number,
 * }} post
 * @returns {T & { content_tags: string[], value_score: number }}
 */
export function ensurePostClassification(post) {
  if (Array.isArray(post.content_tags) && typeof post.value_score === "number") {
    return post;
  }

  const { content_tags, value_score } = classifyPost({
    title: post.title,
    selftext: post.selftext,
    url: post.url,
    linkFlairText: post.linkFlairText,
  });

  return {
    ...post,
    content_tags,
    value_score,
  };
}
