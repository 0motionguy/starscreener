// Shared types for the /drop flow.
//
// Step numbers are the URL contract: ?step=1|2|3|4. Step 1 is the
// sign-in gate; auto-skipped to step 2 when the page detects a Clerk
// session.

export type DropStep = 1 | 2 | 3 | 4;

export const DROP_STEPS: ReadonlyArray<DropStep> = [1, 2, 3, 4];

export function coerceDropStep(raw: unknown, signedIn: boolean): DropStep {
  if (typeof raw === "string") {
    const n = Number(raw);
    if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  }
  return signedIn ? 2 : 1;
}

// Display-facing category list — sourced from the /drop HTML reference.
// Persisted submissions are bucketed into one of the three closed-set
// values in REPO_SUBMISSION_CATEGORIES; the DOMAIN_TO_ENUM map below
// performs the projection.
export const DROP_DISPLAY_CATEGORIES = [
  { id: "cli", label: "CLI", count: 412 },
  { id: "ai-framework", label: "AI Framework", count: 218 },
  { id: "agent", label: "Agent", count: 186 },
  { id: "mcp-server", label: "MCP Server", count: 312 },
  { id: "dev-tool", label: "Dev Tool", count: 624 },
  { id: "local-llm", label: "Local LLM", count: 128 },
  { id: "rag", label: "RAG", count: 218 },
  { id: "skill", label: "Skill", count: 126 },
] as const;

export type DropDisplayCategoryId = (typeof DROP_DISPLAY_CATEGORIES)[number]["id"];

// Display tag pool. The closed-set REPO_SUBMISSION_TAGS only contains
// 12 normalized values; this list is the marketing/UX surface. On
// submit we project to the closed set via DISPLAY_TAG_TO_ENUM.
export const DROP_DISPLAY_TAGS: ReadonlyArray<string> = [
  "CLI",
  "PYTHON",
  "DEV-TOOL",
  "AI",
  "AGENTS",
  "MCP",
  "RAG",
  "CODING",
  "EVAL",
  "STREAMING",
  "OBSERVABILITY",
  "MEMORY",
  "VECTOR-DB",
  "FRAMEWORK",
  "PRODUCTIVITY",
  "TERMINAL",
];

// Project the 8-display picker -> closed 3-set enum the backend accepts.
export function displayCategoryToEnum(
  display: DropDisplayCategoryId | null,
): "repo" | "skill" | "mcp" | null {
  if (display === null) return null;
  if (display === "mcp-server") return "mcp";
  if (display === "skill") return "skill";
  return "repo";
}

// Project the display tag pool -> closed REPO_SUBMISSION_TAGS values.
// Anything not in the closed set is dropped silently — the server will
// only see legal tags.
const DISPLAY_TAG_TO_ENUM: Record<string, string> = {
  CLI: "CLI",
  AGENTS: "AGENTS",
  AGENT: "AGENTS",
  RAG: "RAG",
  EVAL: "EVAL",
  FRAMEWORK: "FRAMEWORK",
  "VECTOR-DB": "VECTOR",
  VECTOR: "VECTOR",
  CODING: "CODEGEN",
  CODEGEN: "CODEGEN",
  AI: "INFERENCE",
  INFERENCE: "INFERENCE",
  MCP: "FRAMEWORK",
  PYTHON: "DATA",
  STREAMING: "INFERENCE",
  OBSERVABILITY: "DATA",
  MEMORY: "DATA",
  PRODUCTIVITY: "CLI",
  TERMINAL: "CLI",
  "DEV-TOOL": "CLI",
};

export function displayTagsToEnumTags(displayTags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of displayTags) {
    const mapped = DISPLAY_TAG_TO_ENUM[t.toUpperCase()];
    if (mapped && !seen.has(mapped)) {
      out.push(mapped);
      seen.add(mapped);
    }
  }
  return out.slice(0, 4); // server cap MAX_TAGS = 4
}

export const DROP_MAX_DISPLAY_TAGS = 5;
