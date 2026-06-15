/**
 * Category classification — maps each consensus-trending repo to one of the
 * 32 categories from C-CAT (src/lib/constants.ts). Without this, the 17 new
 * chips shipped in C-CAT PR #3174 read "0 repos."
 */

export interface RepoCategoryAssignment {
  fullName: string;
  categoryId: string;
  confidence: number;
  classifiedAt: string;
  generator: 'nanogpt' | 'kimi' | 'fallback';
}

export interface CategoryClassifyPayload {
  computedAt: string;
  staleness_seconds: number;
  itemCount: number;
  assignments: Record<string, RepoCategoryAssignment>;
  unclassified: string[];
  generator: 'nanogpt' | 'kimi' | 'fallback';
  model?: string;
}

export const EMPTY_PAYLOAD: CategoryClassifyPayload = {
  computedAt: '',
  staleness_seconds: 0,
  itemCount: 0,
  assignments: {},
  unclassified: [],
  generator: 'fallback',
};

/** The 32 valid category IDs from src/lib/constants.ts (C-CAT taxonomy). */
export const VALID_CATEGORY_IDS = [
  'ai-agents',
  'mcp',
  'devtools',
  'browser-automation',
  'local-llm',
  'security',
  'infrastructure',
  'design-engineering',
  'ai-ml',
  'web-frameworks',
  'databases',
  'mobile',
  'data-analytics',
  'crypto-web3',
  'rust-ecosystem',
  'game-dev',
  'iot-edge',
  'education',
  'robotics',
  'ar-vr-3d',
  'bio-health',
  'productivity-nocode',
  'open-models-datasets',
  'networking',
  'observability',
  'compilers-runtimes',
  'testing-qa',
  'documentation',
  'embedded-systems',
  'media-streaming',
  'cryptography',
  'privacy',
] as const;

export type CategoryId = (typeof VALID_CATEGORY_IDS)[number];

/** One-line descriptions handed to the LLM as the classification schema. */
export const CATEGORY_BRIEFS: Record<CategoryId, string> = {
  'ai-agents': 'Agent frameworks, copilots, autonomous workflows, multi-agent systems',
  mcp: 'Model Context Protocol servers, connectors, registries, MCP ecosystems',
  devtools: 'Build tools, linters, formatters, editors, DX utilities',
  'browser-automation': 'Browser-use stacks, automation agents, web operators, testing runtimes',
  'local-llm': 'On-device inference engines, local model runtimes, self-hosted LLM stacks',
  security: 'Vulnerability scanning, secrets detection, security automation',
  infrastructure: 'Cloud platforms, orchestration, containers, deployment tools',
  'design-engineering': 'Design-to-code systems, UI generation, design tooling, frontend engineering kits',
  'ai-ml': 'LLMs, inference engines, training frameworks, AI tooling',
  'web-frameworks': 'Frontend and full-stack frameworks for the modern web',
  databases: 'SQL, NoSQL, vector, time-series, analytical databases',
  mobile: 'Cross-platform frameworks, native tooling, desktop apps',
  'data-analytics': 'BI tools, data pipelines, visualization, analytics engines',
  'crypto-web3': 'Blockchain clients, smart-contract tooling, DeFi infrastructure',
  'rust-ecosystem': 'Rust-native libraries, frameworks, performance tools',
  'game-dev': 'Engines, frameworks, mod tooling, game-runtime libraries',
  'iot-edge': 'Embedded firmware, edge runtimes, sensor stacks, home-automation hubs',
  education: 'Curricula, interactive lessons, learn-by-doing repos, CS-101 references',
  robotics: 'ROS stacks, motion planning, simulators, physical-agent toolkits',
  'ar-vr-3d': 'Spatial computing runtimes, 3D engines, WebXR, immersive UI tooling',
  'bio-health': 'Bioinformatics pipelines, clinical-data tooling, life-sciences libraries',
  'productivity-nocode': 'Workflow automators, no-code builders, RPA stacks, self-hosted productivity',
  'open-models-datasets': 'Open-weight model repos, curated datasets, evaluation suites',
  networking: 'Proxies, mesh networking, protocol implementations, packet-level tooling',
  observability: 'Tracing, metrics, logging, OpenTelemetry collectors, SLO platforms',
  'compilers-runtimes': 'Language toolchains, compilers, JIT runtimes, parser frameworks',
  'testing-qa': 'Test runners, fuzzers, property-based testing, CI gates',
  documentation: 'Static-site generators, docs-as-code, knowledge bases, changelog tooling',
  'embedded-systems': 'Bare-metal kernels, RTOSes, MCU libraries, embedded build pipelines',
  'media-streaming': 'Audio/video pipelines, codecs, broadcasting servers, live-streaming tooling',
  cryptography: 'Symmetric/asymmetric primitives, zero-knowledge proofs, crypto libraries',
  privacy: 'Self-hosted alternatives, end-to-end-encrypted apps, tracker-blocking tooling',
};

export const CHUNK_SIZE = 20;
export const RECLASSIFY_AFTER_DAYS = 7;
