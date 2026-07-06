// Content calendar (CE-4) — when to post what. Pure + deterministic so the
// weekly matrix is unit-testable with fixed dates; the runner passes the slot
// (one per cron line), the calendar answers with a format.
//
//   slot A (08:47)  trending_single with criteria copy — every day
//   slot B (12:47)  rotating themed pack:
//                     Mon ai-agents / Tue rag / Wed mcp-tools /
//                     Thu self-hosted / Fri fresh-finds / Sat devtools /
//                     Sun weekly-top10 (full 10-row card)
//   slot C (17:47)  alternates discovery_single (even UTC days) /
//                   trending_single (odd) — the "next gem" surface
//
// X_CALENDAR_OVERRIDE (optional JSON, box env) can remap any slot/day:
//   {"B":{"0":{"format":"trending_single"}}}   // Sundays: no pack
// Malformed overrides are ignored — the fixed matrix always works.

export type SlotId = "A" | "B" | "C";

export type SlotFormatKind = "trending_single" | "discovery_single" | "trending_pack";

export interface SlotFormat {
  format: SlotFormatKind;
  packId?: string;
}

/** getUTCDay() order: 0=Sun ... 6=Sat. */
const B_ROTATION: Record<number, string> = {
  0: "weekly-top10",
  1: "ai-agents",
  2: "rag",
  3: "mcp-tools",
  4: "self-hosted",
  5: "fresh-finds",
  6: "devtools",
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

  if (slot === "B") return { format: "trending_pack", packId: B_ROTATION[day] };
  if (slot === "C") {
    const dayOfMonth = new Date(nowMs).getUTCDate();
    return dayOfMonth % 2 === 0
      ? { format: "discovery_single" }
      : { format: "trending_single" };
  }
  return { format: "trending_single" };
}
