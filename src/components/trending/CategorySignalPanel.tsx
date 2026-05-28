import Link from "next/link";

import type { Repo } from "@/lib/types";
import type { CategoryId, WindowId } from "./TrendingHubHero";
import { RepoSparkline } from "./RepoSparkline";

interface CategorySignalPanelProps {
  category: CategoryId;
  window: WindowId;
  count: number;
  repos: Repo[];
}

const COPY: Record<Exclude<CategoryId, "repos">, { title: string; deck: string; cta: string }> = {
  agents: {
    title: "Agent repository radar",
    deck: "Agent frameworks and automation repos with source consensus, star movement, and mention lift.",
    cta: "/agents",
  },
  llms: {
    title: "LLM leaderboard",
    deck: "Frontier model rankings backed by Artificial Analysis — intelligence, price, speed, latency.",
    cta: "/llms",
  },
  models: {
    title: "Model marketplace",
    deck: "Every model routable through OpenRouter — pricing, context window, modality, and live weekly-usage rank.",
    cta: "/?cat=models",
  },
};

export function CategorySignalPanel({ category, count, repos }: CategorySignalPanelProps) {
  if (category === "repos") return null;
  const copy = COPY[category];
  const leaders = pickLeaders(category, repos).slice(0, 12);

  return (
    <section className="category-signal-panel">
      <div className="card category-hero">
        <div>
          <div className="page-eyebrow">
            <span className="live-dot live" /> {count.toLocaleString()} cached signals
          </div>
          <h2>{copy.title}</h2>
          <p>{copy.deck}</p>
        </div>
        <Link className="btn primary sm" href={copy.cta} prefetch={false}>
          Open focused surface
        </Link>
      </div>

      <div className="category-grid">
        {leaders.map((repo, index) => (
          <Link
            key={repo.id}
            href={`/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`}
            className="category-cell"
            data-repo-hover
            data-repo={repo.fullName}
            prefetch={false}
          >
            <span className="category-mark">{String(index + 1).padStart(2, "0")}</span>
            <span className="category-name">{repo.fullName}</span>
            <span className="category-desc">{repo.description || repo.language || "Live signal candidate"}</span>
            <RepoSparkline data={repo.sparklineData?.slice(-30)} repo={repo} />
            <span className="category-metric">
              +{(repo.starsDelta24h ?? 0).toLocaleString()} stars · {(repo.channelsFiring ?? 0).toLocaleString()} sources
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function pickLeaders(category: CategoryId, repos: Repo[]): Repo[] {
  const matchers: Record<Exclude<CategoryId, "repos">, string[]> = {
    agents: ["agent", "crew", "workflow", "automation"],
    llms: ["llm", "model", "hugging", "transformer", "rag"],
    models: ["model", "llm", "inference", "openrouter", "serving"],
  };
  const words = category === "repos" ? [] : matchers[category];
  const scored = repos.map((repo) => ({
    repo,
    score:
      (repo.starsDelta24h ?? 0) +
      (repo.channelsFiring ?? 0) * 50 +
      keywordScore(repo, words) * 250,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.repo);
}

function keywordScore(repo: Repo, words: string[]): number {
  const haystack = [repo.fullName, repo.description, repo.language, ...(repo.tags ?? []), ...(repo.topics ?? [])].join(" ").toLowerCase();
  return words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}
