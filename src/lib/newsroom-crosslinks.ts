export interface NewsroomCrossLink {
  repoFullName: string;
  newsroomTitle: string;
  newsroomUrl: string;
  sourceUrl: string;
  note?: string;
}

const LINKS: ReadonlyArray<NewsroomCrossLink> = [
  {
    repoFullName: "anthropics/claude-code",
    newsroomTitle: "Claude Code v2.1.111 release coverage",
    newsroomUrl: "https://agnt.newsroom/anthropics-claude-code-v2.1.111",
    sourceUrl:
      "https://github.com/anthropics/claude-code/releases/tag/v2.1.111",
    note: "Release intake from agnt.newsroom inputs/releases",
  },
  {
    repoFullName: "anthropics/anthropic-sdk-python",
    newsroomTitle: "Anthropic SDK Python v0.96.0 release coverage",
    newsroomUrl:
      "https://agnt.newsroom/anthropics-anthropic-sdk-python-v0.96.0",
    sourceUrl:
      "https://github.com/anthropics/anthropic-sdk-python/releases/tag/v0.96.0",
    note: "Release intake from agnt.newsroom inputs/releases",
  },
  {
    repoFullName: "openai/openai-agents-python",
    newsroomTitle: "OpenAI Agents Python v0.14.1 release coverage",
    newsroomUrl:
      "https://agnt.newsroom/openai-openai-agents-python-v0.14.1",
    sourceUrl:
      "https://github.com/openai/openai-agents-python/releases/tag/v0.14.1",
    note: "Release intake from agnt.newsroom inputs/releases",
  },
  {
    repoFullName: "langchain-ai/langchain",
    newsroomTitle: "LangChain core v1.2.30 release coverage",
    newsroomUrl:
      "https://agnt.newsroom/langchain-ai-langchain-langchain-core-1.2.30",
    sourceUrl:
      "https://github.com/langchain-ai/langchain/releases/tag/langchain-core%3D%3D1.2.30",
    note: "Release intake from agnt.newsroom inputs/releases",
  },
  {
    repoFullName: "crewAIInc/crewAI",
    newsroomTitle: "crewAI v1.14.2a3 release coverage",
    newsroomUrl: "https://agnt.newsroom/crewaiinc-crewai-1.14.2a3",
    sourceUrl: "https://github.com/crewAIInc/crewAI/releases/tag/1.14.2a3",
    note: "Release intake from agnt.newsroom inputs/releases",
  },
];

const BY_REPO = new Map(
  LINKS.map((item) => [item.repoFullName.toLowerCase(), item] as const),
);

export function getNewsroomCrossLink(
  repoFullName: string | null | undefined,
): NewsroomCrossLink | null {
  if (!repoFullName) return null;
  return BY_REPO.get(repoFullName.toLowerCase()) ?? null;
}

export function listNewsroomCrossLinks(): ReadonlyArray<NewsroomCrossLink> {
  return LINKS;
}

