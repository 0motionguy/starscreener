// Per-repo editorial overview — LLM-written, citation-ready prose for a single
// freshly-dropped repo. Co-located with the drop-deep-enrich-drain that invokes
// it (event-driven off a drop pickup, not a scheduled sweep).
//
// Distinct from the topic-keyed editorial-writer (which frames /best/[topic]
// listicles): this writes a "what this repo IS + why it matters" overview for
// ONE repo, surfaced on its profile page and fed into the repo JSON-LD so AI
// answer engines (Perplexity, Google AI Overview, ChatGPT) cite the drop.
//
// Reuses the shared callLlm router (Kimi primary + NanoGPT fallback, stream:true
// + UA allowlist handled inside the client) — never a bespoke LLM client.

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { FetcherContext } from '../../lib/types.js';
import { callLlm, getLlmProvider, isLlmConfigured } from '../../lib/llm/router.js';
import { parseJson } from '../../lib/llm/kimi-client.js';
import type { LlmProvider } from '../../lib/llm/types.js';
import type { CommunityProfilePayload } from '../repo-community-profile/index.js';

const README_EXCERPT_CHARS = 2400;

const CitationSchema = z.object({
  title: z.string().min(1).max(80),
  url: z.string().regex(/^https:\/\/[^\s]+$/i, 'https URL required'),
});

export const RepoEditorialReportSchema = z.object({
  tagline: z.string().min(1).max(160).optional(),
  overview: z.string().min(30).max(900),
  citations: z.array(CitationSchema).max(5).optional(),
});

export type RepoEditorialReport = z.infer<typeof RepoEditorialReportSchema>;

// Strip hashtags, @mentions, emoji-ish symbols, and collapse whitespace. Small
// fallback models (NanoGPT kimi-k2.6) sometimes degenerate into hashtag spam on
// README-derived input — this keeps such noise out of the stored prose.
function sanitizeProse(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[#＃@][\p{L}\p{N}_]+/gu, "")
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// Coalesce the overview from the keys models actually emit, sanitize, clamp.
function coalesceOverview(obj: Record<string, unknown>): string {
  for (const key of ["overview", "summary", "description", "body"]) {
    const v = sanitizeProse(obj[key]);
    if (v.length >= 30) return v.slice(0, 900);
  }
  return "";
}

export interface RepoEditorialPayload extends RepoEditorialReport {
  fullName: string;
  computedAt: string;
  generator: LlmProvider | 'template';
  model?: string;
}

export function repoEditorialSlug(fullName: string): string {
  return `repo-editorial:${fullName.toLowerCase().replace('/', '__')}`;
}

const SYSTEM_PROMPT = `You are the TrendingRepo editorial writer.

Your job: write a short, expert overview of ONE open-source repository so it reads as genuine analysis a developer or technical buyer would trust — and so AI answer engines (Perplexity, Google AI Overview, ChatGPT) cite it.

INPUT
A JSON object describing one repo: { fullName, topics, languages, license, homepageUrl, readmeExcerpt, citationCandidates }.

OUTPUT
Respond with ONLY a JSON object (no prose around it, no code fences). Emit "overview" FIRST and treat it as the most important field:
{
  "overview": "2-4 complete sentences. Define what the project does, what problem it solves, who it is for, and what makes it notable. Concrete and specific — ground it in the README and topics, never invent features.",
  "tagline": "A single noun phrase, at most 12 words. No punctuation lists.",
  "citations": [{ "title": "string <=80 chars", "url": "MUST be from input citationCandidates" }]
}

HARD RULES
- Output ONLY the JSON object. Stop immediately after the closing brace.
- NEVER use hashtags (#word), emojis, @mentions, or social-media phrasing. This is analytical prose, not a social post.
- Do NOT repeat words or phrases. No filler, no marketing fluff, no hedging ("might", "perhaps"), no first person, no "this repository".
- Factual and grounded in the provided README/topics. Do NOT invent features, benchmarks, star counts, dates, or funding.
- Lead the overview with what the project actually does, not "This is a repo that...".
- Plain text only in overview/tagline (no markdown, no links, no lists).
- citations: 1-3 entries, picked ONLY from input citationCandidates. Always include the GitHub URL. Never invent a URL.`;

interface RepoEditorialInput {
  fullName: string;
  topics: string[];
  languages: string[];
  license: string | null;
  homepageUrl: string | null;
  readmeExcerpt: string | null;
  citationCandidates: Array<{ title: string; url: string }>;
}

function buildCitationCandidates(
  fullName: string,
  profile: CommunityProfilePayload | null,
): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [
    { title: `GitHub: ${fullName}`, url: `https://github.com/${fullName}` },
  ];
  const homepage = profile?.homepageUrl;
  if (homepage && /^https:\/\//i.test(homepage)) {
    out.push({ title: `${fullName} homepage`, url: homepage });
  }
  const docs = profile?.documentationUrl;
  if (docs && /^https:\/\//i.test(docs) && docs !== homepage) {
    out.push({ title: `${fullName} documentation`, url: docs });
  }
  return out;
}

function buildUserMessage(input: RepoEditorialInput): string {
  return JSON.stringify(input, null, 2);
}

/**
 * Generate the per-repo editorial overview from the community profile we just
 * fetched. Returns null when the LLM is unconfigured, the call fails, or the
 * output fails schema validation — the caller skips the write so an existing
 * overview is never clobbered with empty (keep-last discipline).
 */
export async function runRepoEditorial(
  ctx: FetcherContext,
  fullName: string,
  profile: CommunityProfilePayload | null,
): Promise<RepoEditorialPayload | null> {
  if (!isLlmConfigured()) {
    ctx.log.warn({ fullName }, 'repo-editorial: LLM unconfigured — skipping');
    return null;
  }

  const readme = profile?.readmeMarkdown ?? null;
  const input: RepoEditorialInput = {
    fullName,
    topics: Array.isArray(profile?.topics) ? profile!.topics.slice(0, 12) : [],
    languages: (profile?.languages?.languages ?? []).slice(0, 4).map((l) => l.name),
    license: profile?.license?.spdxId ?? null,
    homepageUrl: profile?.homepageUrl ?? null,
    readmeExcerpt: readme ? readme.slice(0, README_EXCERPT_CHARS) : null,
    citationCandidates: buildCitationCandidates(fullName, profile),
  };

  try {
    const r = await callLlm(
      {
        systemPrompt: SYSTEM_PROMPT,
        userMessage: buildUserMessage(input),
        maxTokens: 2000,
        // Low temperature: the fallback model degenerates into hashtag spam at
        // 0.5 on README-derived input. 0.2 keeps it on-task.
        temperature: 0.2,
        jsonMode: true,
      },
      { feature: 'editorial', task_type: 'summary', request_id: randomUUID() },
    );
    const parsed = parseJson(r.text);
    const obj =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};

    // Normalize before validation: pull overview from whatever key the model
    // used, sanitize hashtag/emoji noise, clamp the tagline. A tagline longer
    // than 140 chars is the model cramming the overview in — drop it.
    const overview = coalesceOverview(obj);
    const taglineRaw = sanitizeProse(obj.tagline);
    const tagline =
      taglineRaw.length > 0 && taglineRaw.length <= 140 ? taglineRaw : undefined;
    const citations = Array.isArray(obj.citations) ? obj.citations : undefined;

    const validated = RepoEditorialReportSchema.safeParse({
      overview,
      tagline,
      citations,
    });
    if (!validated.success) {
      ctx.log.warn(
        { fullName, issues: validated.error.issues.slice(0, 3) },
        'repo-editorial: report failed schema validation',
      );
      return null;
    }
    return {
      fullName,
      computedAt: new Date().toISOString(),
      generator: r.meta.provider ?? getLlmProvider(),
      model: r.meta.model,
      ...validated.data,
    };
  } catch (err) {
    ctx.log.warn(
      { fullName, err: err instanceof Error ? err.message : String(err) },
      'repo-editorial: call failed',
    );
    return null;
  }
}
