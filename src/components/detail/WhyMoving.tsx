import { Zap } from "lucide-react";
import type { WhyMoving as WhyMovingType } from "@/lib/types";

interface WhyMovingProps {
  whyMoving: WhyMovingType | null;
}

const CONFIDENCE_DOT: Record<string, string> = {
  high: "bg-accent-green",
  medium: "bg-accent-amber",
  low: "bg-text-tertiary",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function WhyMoving({ whyMoving }: WhyMovingProps) {
  return (
    <section className="space-y-3 animate-slide-up">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-accent-amber shrink-0" />
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
          Why is this moving?
        </h2>
      </div>

      {/* Headline */}
      {whyMoving && (
        <p className="text-text-secondary text-sm leading-relaxed">
          {whyMoving.headline}
        </p>
      )}

      {/* Factors or empty state */}
      {!whyMoving ? (
        <div className="bg-bg-card rounded-card p-4 border shadow-card">
          <p className="text-text-tertiary text-sm">
            No significant movement detected
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {whyMoving.factors.map((factor, i) => (
            <div
              key={i}
              className="bg-bg-card rounded-card p-3 border shadow-card space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-text-primary text-sm">
                  {factor.headline}
                </h3>
                <span className="font-mono text-xs text-text-tertiary whitespace-nowrap px-1.5 py-0.5 bg-bg-secondary rounded-badge">
                  {factor.timeframe}
                </span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {factor.detail}
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${CONFIDENCE_DOT[factor.confidence]}`}
                  aria-hidden="true"
                />
                <span className="text-xs text-text-tertiary">
                  {CONFIDENCE_LABEL[factor.confidence]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
