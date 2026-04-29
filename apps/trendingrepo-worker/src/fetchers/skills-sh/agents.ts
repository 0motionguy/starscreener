// AGENT_REGISTRY for skills.sh. Source of truth: github.com/vercel-labs/skills
// README. 45 agents researched 2026-04-26. Brand colors are best-effort -
// where simpleicons.org or the agent's own brand guide gave us a hex, we use
// it; otherwise null. A one-time SVG-color-extraction pass against
// https://skills.sh/agents/<id>.svg can fill the nulls post-deploy.
//
// AGENT_REGISTRY_VERSION is bumped each time the table changes - emitted in
// the leaderboard payload so consumers can detect drift.

import type { AgentRegistryEntry, AgentCategory } from './types.js';

export const AGENT_REGISTRY_VERSION = '2026-04-26.1';

const ICON_BASE = 'https://skills.sh/agents';

function row(
  agent_id: string,
  display_name: string,
  category: AgentCategory,
  vendor: string,
  official_url: string | null,
  brand_color: string | null = null,
): AgentRegistryEntry {
  return {
    agent_id,
    display_name,
    category,
    vendor,
    official_url,
    icon_url: `${ICON_BASE}/${agent_id}.svg`,
    brand_color,
  };
}

const ENTRIES: AgentRegistryEntry[] = [
  row('amp', 'Amp', 'agent_framework', 'Sourcegraph', 'https://ampcode.com'),
  row('antigravity', 'Antigravity', 'ide', 'Antigravity', 'https://antigravity.dev'),
  row('augment', 'Augment Code', 'ide', 'Augment Code', 'https://www.augmentcode.com'),
  row('bob', 'IBM Bob', 'agent_framework', 'IBM', 'https://research.ibm.com/publications/bob-the-coding-agent'),
  row('claude-code', 'Claude Code', 'terminal_cli', 'Anthropic', 'https://www.anthropic.com/claude-code', '#C15F3C'),
  row('cline', 'Cline', 'agent_framework', 'Cline', 'https://cline.bot'),
  row('codebuddy', 'CodeBuddy', 'ide', 'Tencent Cloud', 'https://copilot.tencent.com'),
  row('codex', 'Codex', 'terminal_cli', 'OpenAI', 'https://openai.com/codex', '#10A37F'),
  row('command-code', 'Command Code', 'terminal_cli', 'Command', null),
  row('continue', 'Continue', 'agent_framework', 'Continue Dev', 'https://continue.dev', '#4F46E5'),
  row('cortex', 'Cortex', 'agent_framework', 'Cortex', 'https://cortex.dev'),
  row('crush', 'Crush', 'ide', 'Crush', 'https://crush.dev'),
  row('cursor', 'Cursor', 'ide', 'Anysphere', 'https://www.cursor.com', '#000000'),
  row('deepagents', 'Deep Agents', 'agent_framework', 'Deep Agents', null),
  row('droid', 'Droid', 'agent_framework', 'Factory AI', 'https://factory.ai/droid'),
  row('firebender', 'Firebender', 'ide', 'Firebender', 'https://firebender.com'),
  row('gemini-cli', 'Gemini CLI', 'terminal_cli', 'Google', 'https://github.com/google-gemini/gemini-cli', '#4285F4'),
  row('github-copilot', 'GitHub Copilot', 'ide', 'GitHub / Microsoft', 'https://github.com/features/copilot', '#24292E'),
  row('goose', 'Goose', 'agent_framework', 'Block', 'https://block.github.io/goose'),
  row('iflow-cli', 'iFlow CLI', 'terminal_cli', 'iFlow', 'https://iflow.cn'),
  row('junie', 'Junie', 'ide', 'JetBrains', 'https://www.jetbrains.com/junie', '#FF318C'),
  row('kilo', 'Kilo Code', 'terminal_cli', 'Kilo', 'https://kilocode.ai'),
  row('kimi-cli', 'Kimi CLI', 'terminal_cli', 'Moonshot AI', 'https://kimi.moonshot.cn', '#1E88E5'),
  row('kiro-cli', 'Kiro CLI', 'terminal_cli', 'Amazon', 'https://kiro.dev', '#FF9900'),
  row('kode', 'Kode', 'agent_framework', 'Kode', null),
  row('mcpjam', 'MCPJam', 'meta', 'MCPJam', 'https://mcpjam.com'),
  row('mistral-vibe', 'Mistral Vibe', 'agent_framework', 'Mistral AI', 'https://mistral.ai', '#FA520F'),
  row('mux', 'Mux', 'agent_framework', 'Mux', null),
  row('neovate', 'Neovate', 'ide', 'Neovate', null),
  row('openclaw', 'OpenClaw', 'terminal_cli', 'AGNT / ICM Motion', 'https://open-claw.bot', '#1E88E5'),
  row('opencode', 'OpenCode', 'agent_framework', 'SST', 'https://opencode.ai'),
  row('openhands', 'OpenHands', 'agent_framework', 'All Hands AI', 'https://www.all-hands.dev', '#4F46E5'),
  row('pi', 'Pi', 'chat', 'Inflection AI', 'https://pi.ai', '#8B5CF6'),
  row('pochi', 'Pochi', 'ide', 'Pochi', 'https://pochi.dev'),
  row('qoder', 'Qoder', 'agent_framework', 'Qoder', 'https://qoder.com'),
  row('qwen-code', 'Qwen Code', 'terminal_cli', 'Alibaba', 'https://qwenlm.ai', '#FF6A00'),
  row('replit', 'Replit', 'platform', 'Replit', 'https://replit.com', '#F26207'),
  row('roo', 'Roo Code', 'agent_framework', 'Roo Code', 'https://roocode.com'),
  row('trae', 'Trae', 'ide', 'ByteDance', 'https://www.trae.ai', '#161823'),
  row('trae-cn', 'Trae CN', 'ide', 'ByteDance', 'https://www.trae.com.cn', '#161823'),
  row('universal', 'Universal', 'meta', 'Vercel Labs', 'https://skills.sh'),
  row('warp', 'Warp', 'ide', 'Warp', 'https://www.warp.dev', '#01A4FF'),
  row('windsurf', 'Windsurf', 'ide', 'Codeium', 'https://windsurf.com', '#00BBA4'),
  row('zencoder', 'Zencoder', 'agent_framework', 'Zencoder', 'https://zencoder.ai'),
  row('adal', 'Adal', 'agent_framework', 'Adal', null),
];

export const AGENT_REGISTRY: Readonly<Record<string, AgentRegistryEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.agent_id, e])),
);

export const ALL_AGENT_IDS: readonly string[] = ENTRIES.map((e) => e.agent_id);

export function lookupAgent(agentId: string): AgentRegistryEntry | null {
  return AGENT_REGISTRY[agentId] ?? null;
}

export function iconUrl(agentId: string): string {
  return `${ICON_BASE}/${agentId}.svg`;
}

export function brandColor(agentId: string): string | null {
  return AGENT_REGISTRY[agentId]?.brand_color ?? null;
}

export function isOpenClawCompatible(agents: ReadonlyArray<string>): boolean {
  return agents.includes('openclaw');
}

export interface AgentCategoryGroups {
  terminal_cli: string[];
  ide: string[];
  agent_framework: string[];
  platform: string[];
  meta: string[];
  chat: string[];
  unknown: string[];
}

export function categoriseAgents(agents: ReadonlyArray<string>): AgentCategoryGroups {
  const groups: AgentCategoryGroups = {
    terminal_cli: [],
    ide: [],
    agent_framework: [],
    platform: [],
    meta: [],
    chat: [],
    unknown: [],
  };
  for (const id of agents) {
    const entry = AGENT_REGISTRY[id];
    if (entry) groups[entry.category].push(id);
    else groups.unknown.push(id);
  }
  return groups;
}
