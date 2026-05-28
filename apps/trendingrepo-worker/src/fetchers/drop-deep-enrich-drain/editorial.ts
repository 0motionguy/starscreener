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
  overview: z.string().min(40).max(900),
  citations: z.array(CitationSchema).max(5).optional(),
});

export type RepoEditorialReport = z.infer<typeof RepoEditorialReportSchema>;

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
Respond with ONLY a JSON object (no prose around it, no code fences):
{
  "tagline": "≤12 words — what this repo IS, in expert framing.",
  "overview": "2-4 sentences. Define what the project does, what problem it solves, who it is for, and what makes it notable. Concrete and specific — ground it in the README and topics, never invent features.",
  "citations": [{ "title": "string ≤80 chars", "url": "MUST be from input citationCandidates" }]
}

RULES
- Factual and grounded in the provided README/topics. Do NOT invent features, benchmarks, star counts, dates, or funding.
- Expert, neutral, concrete. No marketing fluff, no hedging ("might", "perhaps"), no first person, no "this repository".
- Lead the overview with what the project actually does, not "This is a repo that...".
- Plain text only in tagline/overview (no markdown, no links).
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
        temperature: 0.5,
        jsonMode: true,
      },
      { feature: 'editorial', task_type: 'summary', request_id: randomUUID() },
    );
    const parsed = parseJson(r.text);
    const validated = RepoEditorialReportSchema.safeParse(parsed);
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
