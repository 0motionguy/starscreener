// V4 — MoverRow
//
// Row primitive for funding.html § 02 "Biggest rounds · 24h" panel.
//
// Layout: rank · logo · name+meta · raised · stage-pill
//
// Differs from RankRow in that:
//   - Stage pill at the right has its own color contract
//     (mega → orange, F/E/D/C/B/A → tier palette, seed → cyan)
//   - "raised" big-number is mono in --v4-money
//   - First row gets the green-rail treatment (not orange)
//
// 2026-05-07 polish (A3): the underlying .v4-mover-row CSS only declares 4
// grid columns but the JSX renders 5 children (rank, logo, body, amount,
// stage). The implicit 5th auto column made amount + stage widths drift
// row-by-row, so $700M and $3.8M did not visually line up. We override the
// grid template inline with a stable 5-column spec including a fixed-width
// amount column so values right-align under tabular-nums and stage pills
// land in the same x-position regardless of magnitude.
//
// Usage:
//   <MoverRow
//     rank={1}
//     name="Anthropic"
//     meta="AI labs · 4.0B post · led by Lightspeed"
//     amount="$2.0B"
//     stage="Series F"
//     first
//   />

import { cn } from "@/lib/utils";
import { EntityLogo } from "@/components/ui/EntityLogo";

export type FundingStage =
  | "Seed"
  | "Series A"
  | "Series B"
  | "Series C"
  | "Series D"
  | "Series E"
  | "Series F"
  | "Series F+"
  | "Growth"
  | "IPO"
  | "M&A";

export interface MoverRowProps {
  rank: number;
  name: string;
  meta?: string;
  amount: string;
  stage: FundingStage | string;
  /** Apply #1-row green-rail treatment. */
  first?: boolean;
  /** Optional href — renders as <a>. */
  href?: string;
  className?: string;
  /** Company logo URL. AUDIT-2026-05-04: closes the funding-page no-images
      gap. Pass extracted.companyLogoUrl from FundingSignal; falls back to
      a deterministic monogram tile via EntityLogo when null/blocked. */
  logoUrl?: string | null;
  /** Used by EntityLogo for the monogram fallback when logoUrl is null
      or fails to load. Defaults to the row name. */
  logoName?: string;
  /** Optional eyebrow tag rendered inline in the meta line, e.g. "HOT".
      A3 polish: lets A4 tag the most recent or biggest round without
      wedging extra DOM into the meta string. */
  tag?: string;
  /** Color for the optional `tag` chip. Defaults to liquid-lava orange. */
  tagColor?: string;
}

// Detect amounts that are clearly extraction garbage — bare digits with no
// currency unit (e.g. "$55"), or empty / "Undisclosed" sentinels. Anything
// matching is rendered as an em-dash so the column doesn't render as if a
// real round happened. Real values match /\d+(\.\d+)?[MBK]\b/ after the $.
function isCleanAmount(amount: string | null | undefined): boolean {
  if (!amount) return false;
  const trimmed = amount.trim();
  if (!trimmed || trimmed === "Undisclosed" || trimmed === "—") return false;
  // accept "$2.0B", "$120M", "$500K", "1.2B", "$1.2 B", etc.
  return /\$?\s?\d+(\.\d+)?\s?[MBK]\b/i.test(trimmed);
}

export function MoverRow({
  rank,
  name,
  meta,
  amount,
  stage,
  first = false,
  href,
  className,
  logoUrl,
  logoName,
  tag,
  tagColor,
}: MoverRowProps) {
  const Tag = href ? "a" : "div";
  const stageCls = stageToClass(stage);
  const amountClean = isCleanAmount(amount);
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "v4-mover-row",
        first && "v4-mover-row--first",
        className,
      )}
      // The CSS grid only defines 4 columns but we render 5 children, which
      // made the amount column width drift between rows. Override inline with
      // an explicit 5-track spec: rank · logo · body · amount · stage. The
      // amount column gets a fixed min-width so $1.2B / $3.8M / $700M align.
      style={{
        gridTemplateColumns:
          "24px 28px minmax(0, 1fr) minmax(96px, max-content) auto",
      }}
      title={meta ? `${name} — ${stage}\n${meta}` : `${name} — ${stage}`}
    >
      <span className="v4-mover-row__rank">
        {String(rank).padStart(2, "0")}
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <EntityLogo
          src={logoUrl ?? null}
          name={logoName ?? name}
          size={28}
          shape="square"
          alt=""
        />
      </span>
      <div className="v4-mover-row__body">
        <div className="v4-mover-row__name" title={name}>
          {name}
        </div>
        {(meta || tag) ? (
          <div className="v4-mover-row__meta">
            {tag ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "1px 5px",
                  fontSize: 8.5,
                  letterSpacing: "0.16em",
                  fontWeight: 700,
                  color: tagColor ?? "var(--v4-acc)",
                  border: `1px solid ${tagColor ?? "var(--v4-acc)"}`,
                  borderRadius: 1,
                  textTransform: "uppercase",
                }}
              >
                {tag}
              </span>
            ) : null}
            {meta ? <span>{meta}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="v4-mover-row__amt">
        {amountClean ? amount : <span style={{ color: "var(--v4-ink-400)" }}>—</span>}
        <span className="v4-mover-row__amt-lbl">
          {amountClean ? "RAISED" : "UNDISCLOSED"}
        </span>
      </div>
      <span className={cn("v4-mover-row__stage", stageCls)}>{stage}</span>
    </Tag>
  );
}

function stageToClass(stage: string): string {
  // Match the trailing tier letter explicitly. Earlier substring checks
  // (e.g. `upper.includes("E")`) matched "SERIES" itself and bucketed every
  // round into the orange "mega" class, making /funding look broken (every
  // pill the same colour). Use a regex anchored to the end of the string so
  // "SERIES A" → A, "SERIES E" → mega, "SEED" → seed.
  const upper = stage.toUpperCase().trim();
  if (upper === "GROWTH" || upper === "IPO" || upper === "M&A") {
    return "v4-mover-row__stage--mega";
  }
  if (upper.startsWith("SEED") || upper === "PRE-SEED") {
    return "v4-mover-row__stage--seed";
  }
  // Series E/F/G+ → mega (late-stage / growth equivalents)
  if (/SERIES\s+[EFG]\+?$/.test(upper)) return "v4-mover-row__stage--mega";
  if (/SERIES\s+D\+?$/.test(upper)) return "v4-mover-row__stage--d";
  if (/SERIES\s+C\+?$/.test(upper)) return "v4-mover-row__stage--c";
  if (/SERIES\s+B\+?$/.test(upper)) return "v4-mover-row__stage--b";
  if (/SERIES\s+A\+?$/.test(upper)) return "v4-mover-row__stage--a";
  return "v4-mover-row__stage--default";
}
