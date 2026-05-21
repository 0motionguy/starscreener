"use client";

import { ArrowLeftRight } from "@/lib/icons";
import {
  ChartLineIcon,
  ClockIcon,
  CodeIcon,
} from "@/components/icons-animated";
import { SectionEyebrow } from "./ToolCard";

const VALUES = [
  {
    title: "6-way compare",
    desc: "Pit 6 repos side-by-side instead of 2. Filter by language, sort by metric.",
    icon: "compare",
  },
  {
    title: "5-yr star history",
    desc: "Full historical depth from 2020 to today. Annotated breakout markers.",
    icon: "history",
  },
  {
    title: "RSS / Webhook / Slack",
    desc: "Subscribe to repo events and push them to your reader, Discord, or ops channel.",
    icon: "feed",
  },
  {
    title: "CSV / API access",
    desc: "Pull repos, mentions, funding rounds into your sheet or pipeline.",
    icon: "api",
  },
];

export function ToolsValueStrip() {
  return (
    <section>
      <SectionEyebrow
        num="06"
        title="What you unlock with PRO"
        meta="$19/mo - cancel anytime - 7-day free trial"
      />
      <div className="value-strip fade-up">
        {VALUES.map((value) => (
          <div className="value-cell" key={value.title}>
            <div className="v-icon">
              <ValueIcon kind={value.icon} />
            </div>
            <div className="v-title">{value.title}</div>
            <div className="v-desc">{value.desc}</div>
            <span className="v-tag">PRO</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValueIcon({ kind }: { kind: string }) {
  if (kind === "history") {
    return <ClockIcon size={20} strokeWidth={1.6} color="currentColor" aria-hidden="true" />;
  }
  if (kind === "feed") {
    return <ChartLineIcon size={20} strokeWidth={1.6} color="currentColor" aria-hidden="true" />;
  }
  if (kind === "api") {
    return <CodeIcon size={20} strokeWidth={1.6} color="currentColor" aria-hidden="true" />;
  }
  return <ArrowLeftRight size={20} strokeWidth={1.6} color="var(--accent)" aria-hidden="true" />;
}
