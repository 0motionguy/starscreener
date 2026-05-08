// Shapes for the skills.sh fetcher. Kept local to this fetcher so the
// global lib/types.ts stays small and source-agnostic.

export type SkillView = 'all-time' | 'trending' | 'hot';

export interface SkillRow {
  rank: number;
  skill_name: string;
  owner: string;
  repo: string;
  /** Stable id matching the skills.sh URL: `${owner}/${repo}/${skill_name}`. */
  source_id: string;
  url: string;
  github_url: string;
  /** Raw count from leaderboard (e.g. 1_200_000 for "1.2M"). null if not visible. */
  installs: number | null;
  /** Agent slugs from the per-row compatibility icons. */
  agents: string[];
  view: SkillView;
  fetchedAt: string;
}

export interface SkillScored extends SkillRow {
  /** Composite score: log1p(installs) * recency * (openclaw_boost ? 1.20 : 1) + velocity_term. */
  trending_score: number;
  /** Convenience flag surfacing the OpenClaw boost decision. */
  openclaw_compatible: boolean;
  /** rank_alltime - rank_24h, normalized to maxRank. null if either rank missing. */
  velocity: number | null;
  /** When the skill repo was last pushed - parsed from skills.sh row OR detail page. */
  last_pushed_at: string | null;
}

export interface SkillsLeaderboardPayload {
  fetchedAt: string;
  windowItems: number;
  views: { all_time: number; trending: number; hot: number };
  agentRegistryVersion: string;
  items: SkillScored[];
  sources: {
    skills_sh_total_seen: number;
    openclaw_compatible_count: number;
  };
}

export type AgentCategory =
  | 'terminal_cli'
  | 'ide'
  | 'platform'
  | 'meta'
  | 'agent_framework'
  | 'chat';

export interface AgentRegistryEntry {
  agent_id: string;
  display_name: string;
  category: AgentCategory;
  vendor: string;
  official_url: string | null;
  icon_url: string;
  brand_color: string | null;
}
