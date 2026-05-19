import Link from "next/link";
import type { JSX } from "react";

import type { RepoBrief } from "@/lib/briefs";

interface RepoBriefProps {
  brief: RepoBrief;
}

interface RepoBriefHeroProps {
  owner: string;
  name: string;
  hook: string;
}

function renderParagraphs(text: string): JSX.Element[] {
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, idx) => (
      <p key={`${chunk.slice(0, 16)}-${idx}`} style={{ marginTop: idx === 0 ? 0 : 8 }}>
        {chunk}
      </p>
    ));
}

export function RepoBriefHero({ owner, name, hook }: RepoBriefHeroProps) {
  return (
    <section className="v2-card p-3" aria-label="Editorial brief highlight">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">{"// BRIEF"}</span>
        <span className="badge badge--info">editorial</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text-primary">{hook}</p>
      <Link href={`/brief/${owner}/${name}`} className="mt-2 inline-block text-xs font-mono uppercase tracking-[0.1em] text-accent hover:underline">
        Read full brief -&gt;
      </Link>
    </section>
  );
}

export function RepoBriefView({ brief }: RepoBriefProps) {
  return (
    <article className="panel" style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <p style={{ fontFamily: "var(--v4-mono)", fontSize: 12, color: "var(--v4-ink-400)", margin: 0 }}>
          {brief.owner}/{brief.name}
        </p>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2 }}>{brief.hook}</h1>
      </header>

      <section>
        <h2 style={{ marginBottom: 8, fontSize: 16 }}>What</h2>
        {renderParagraphs(brief.what)}
      </section>
      <section>
        <h2 style={{ marginBottom: 8, fontSize: 16 }}>Why now</h2>
        {renderParagraphs(brief.why_now)}
      </section>
      <section>
        <h2 style={{ marginBottom: 8, fontSize: 16 }}>Who built it</h2>
        {renderParagraphs(brief.who_built_it)}
      </section>
      <section>
        <h2 style={{ marginBottom: 8, fontSize: 16 }}>Who it&apos;s for</h2>
        {renderParagraphs(brief.who_its_for)}
      </section>
      <section>
        <h2 style={{ marginBottom: 8, fontSize: 16 }}>What&apos;s different</h2>
        {renderParagraphs(brief.whats_different)}
      </section>

      <section>
        <h2 style={{ marginBottom: 8, fontSize: 16 }}>Sources</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          {brief.sources.map((source) => (
            <li key={source}>
              <Link href={source} target="_blank" rel="noopener noreferrer">
                {source}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer style={{ color: "var(--v4-ink-400)", fontSize: 12 }}>
        Written at: {brief.written_at || "unknown"}
      </footer>
    </article>
  );
}

export default RepoBriefView;