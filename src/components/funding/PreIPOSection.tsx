// PreIPOSection — full-width "upcoming AI IPOs" section.
//
// Lives in the /funding main column directly under SectorHeatmap. Replaces
// the cramped pre-IPO list that used to share the right rail with the live
// quotes panel. Wider grid → more breathing room → readable valuation +
// source citation per card.
//
// Data source: AI_PRE_IPO array in src/lib/ai-stocks.ts. Each entry is
// real (press-cited valuation + disclosure date), not a prediction.

import { AI_PRE_IPO, type PreIPOEntry } from "@/lib/ai-stocks";
import { SourceLogo, type SourceName } from "@/components/icon/Icon";

function ipoBadge(entry: PreIPOEntry): { label: string; tone: string } {
  if (entry.ipoStatus === "filed") {
    return { label: `S-1 filed · ${entry.ipoExpectedYear ?? "—"}`, tone: "accent" };
  }
  if (entry.ipoStatus === "pending") {
    return { label: `IPO pending · ${entry.ipoExpectedYear ?? "—"}`, tone: "warn" };
  }
  if (entry.ipoStatus === "rumored") {
    return { label: `Rumored ${entry.ipoExpectedYear ?? "—"}`, tone: "info" };
  }
  return { label: "Private · no plans", tone: "faint" };
}

export function PreIPOSection() {
  const rumoredOrFiled = AI_PRE_IPO.filter(
    (e) => e.ipoStatus === "rumored" || e.ipoStatus === "filed" || e.ipoStatus === "pending",
  );
  const private_ = AI_PRE_IPO.filter((e) => e.ipoStatus === "no-plans");

  return (
    <section className="preipo-section card">
      <PreIPOStyles />

      <div className="preipo-section-head">
        <h2 className="preipo-section-title">
          <span className="slash">{"//"}</span> Upcoming AI IPOs &middot; pre-market watch
        </h2>
        <span className="preipo-section-sub">
          {rumoredOrFiled.length} rumored or filed &middot; {private_.length} private
        </span>
      </div>

      <div className="preipo-section-grid">
        {AI_PRE_IPO.map((entry) => {
          const badge = ipoBadge(entry);
          const isFeatured = entry.ipoStatus === "rumored" || entry.ipoStatus === "filed";
          return (
            <div
              key={entry.name}
              className={`preipo-section-card${isFeatured ? " featured" : ""}`}
            >
              <div className="psc-head">
                <div className="psc-mark">
                  {entry.logoSlug ? (
                    <SourceLogo source={entry.logoSlug as SourceName} size="2xl" alt="" />
                  ) : (
                    <span className="psc-letter">{entry.name.charAt(0)}</span>
                  )}
                </div>
                <div className="psc-id">
                  <span className="psc-name">{entry.name}</span>
                  <span className="psc-blurb">{entry.blurb}</span>
                </div>
                <span className={`psc-badge tone-${badge.tone}`}>{badge.label}</span>
              </div>

              <div className="psc-body">
                <div className="psc-val-row">
                  <span className="psc-val">{entry.valuationLabel}</span>
                  <span className="psc-val-label">latest disclosed</span>
                </div>
                <div className="psc-source">
                  <span className="psc-source-name">{entry.source}</span>
                  <span className="psc-source-date">{entry.valuationDate}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PreIPOStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.preipo-section {
  margin: 16px 0;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.preipo-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.preipo-section-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-bright);
  font-weight: 600;
  margin: 0;
}
.preipo-section-title .slash { color: var(--accent); font-weight: 700; margin-right: 6px; }
.preipo-section-sub {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg-faint);
  letter-spacing: 0.02em;
}

.preipo-section-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--border-subtle);
}
.preipo-section-card {
  background: var(--surface);
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  min-height: 128px;
}
.preipo-section-card.featured::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--accent) 15%,
    var(--accent) 85%,
    transparent 100%
  );
  pointer-events: none;
}

.psc-head {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.psc-mark {
  width: 36px; height: 36px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
}
.psc-letter {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  color: var(--fg-bright);
}
.psc-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.psc-name {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--fg-bright);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.psc-blurb {
  font-size: 11px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.psc-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: var(--r-xs);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.psc-badge.tone-accent {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid rgba(255,107,53,0.32);
}
.psc-badge.tone-warn { background: var(--warning-soft); color: var(--warning); }
.psc-badge.tone-info { background: var(--info-soft); color: var(--info); }
.psc-badge.tone-faint {
  background: var(--surface-3);
  color: var(--fg-subtle);
  border: 1px solid var(--border-subtle);
}

.psc-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle);
}
.psc-val-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.psc-val {
  font-family: var(--font-mono);
  font-size: 22px;
  color: var(--accent);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.psc-val-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--fg-faint);
}
.psc-source {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
}
.psc-source-name { color: var(--fg-muted); }
.psc-source-date { color: var(--fg-faint); margin-left: auto; }

@media (max-width: 1100px) {
  .preipo-section-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .preipo-section-grid { grid-template-columns: 1fr; }
}
`,
      }}
    />
  );
}
