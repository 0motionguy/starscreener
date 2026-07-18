// Content calendar (CE-4) — when to post what. Pure + deterministic so the
// weekly matrix is unit-testable with fixed dates; the runner passes the slot
// (one per cron line), the calendar answers with a format.
//
//   slot D (04:47)  discovery single
//   slot A (08:47)  TOP single
//   slot B (12:47)  rotating AI/tooling pack
//   slot C (17:47)  alternating GAINER / sustained TREND single
//   slot E (21:47)  rotating builder-ecosystem pack
//
// X_CALENDAR_OVERRIDE (optional JSON, box env) can remap any slot/day:
//   {"B":{"0":{"format":"trending_single"}}}   // Sundays: no pack
// Malformed overrides are ignored — the fixed matrix always works.

export type SlotId = "A" | "B" | "C" | "D" | "E";
export type TrendingRanker = "top" | "gainer" | "trend" | "discovery";

export type SlotFormatKind = "trending_single" | "discovery_single" | "trending_pack";

export interface SlotFormat {
  format: SlotFormatKind;
  packId?: string;
  ranker?: TrendingRanker;
}

/** getUTCDay() order: 0=Sun ... 6=Sat. */
const B_ROTATION: Record<number, string> = {
  0: "weekly-top10",
  1: "ai-agents",
  2: "rag",
  3: "mcp-tools",
  4: "local-llm",
  5: "browser-automation",
  6: "devtools",
};

const E_ROTATION: Record<number, string> = {
  0: "design-engineering",
  1: "security",
  2: "infrastructure",
  3: "data",
  4: "web-mobile",
  5: "web3",
  6: "rust",
};

type Override = Partial<Record<SlotId, Record<string, SlotFormat>>>;

function parseOverride(raw: string | undefined): Override | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Override) : null;
  } catch {
    return null;
  }
}

function validFormat(f: unknown): f is SlotFormat {
  if (!f || typeof f !== "object") return false;
  const k = (f as SlotFormat).format;
  return k === "trending_single" || k === "discovery_single" || k === "trending_pack";
}

export function resolveSlotFormat(
  nowMs: number,
  slot: SlotId,
  overrideRaw: string | undefined = process.env.X_CALENDAR_OVERRIDE,
): SlotFormat {
  const day = new Date(nowMs).getUTCDay();

  const override = parseOverride(overrideRaw);
  const fromOverride = override?.[slot]?.[String(day)];
  if (validFormat(fromOverride)) return fromOverride;

  if (slot === "B") return { format: "trending_pack", packId: B_ROTATION[day], ranker: "top" };
  if (slot === "E") return { format: "trending_pack", packId: E_ROTATION[day], ranker: "top" };
  if (slot === "D") return { format: "discovery_single", ranker: "discovery" };
  if (slot === "C") {
    const dayOfMonth = new Date(nowMs).getUTCDate();
    return {
      format: "trending_single",
      ranker: dayOfMonth % 2 === 0 ? "gainer" : "trend",
    };
  }
  return { format: "trending_single", ranker: "top" };
}
