import type { ReactElement } from "react";
import Link from "next/link";

export const metadata = {
  title: "Embeddable Badges | TrendingRepo",
  description:
    "Copy-paste badges for README files. Show a repo as trending on TrendingRepo.",
};

function CodeBlock({ children }: { children: string }): ReactElement {
  return (
    <pre className="overflow-x-auto rounded border border-[color:var(--v2-line-2)] bg-[color:var(--v2-bg-elev-2)] p-3 text-xs text-[color:var(--v2-ink)]">
      <code>{children}</code>
    </pre>
  );
}

export default function BadgeDocsPage(): ReactElement {
  const base = "https://trendingrepo.com/api/badge/vercel/next.js.svg";
  const markdownDefault = `![Trending on TrendingRepo](${base})`;
  const markdownLarge = `![Trending on TrendingRepo](${base}?size=large)`;
  const markdownNoRank = `![Trending on TrendingRepo](${base}?rank=0)`;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10 text-[color:var(--v2-ink)]">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--v2-ink-dim)]">Docs</p>
      <h1 className="mb-3 text-3xl font-semibold">Embeddable Badge</h1>
      <p className="mb-8 text-[color:var(--v2-ink-dim)]">
        Add this to any README to show your repo is trending on TrendingRepo.
      </p>

      <section className="mb-10 space-y-3">
        <h2 className="text-xl font-semibold">Quick Start</h2>
        <CodeBlock>{markdownDefault}</CodeBlock>
        <img src={base} alt="TrendingRepo badge default example" />
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="text-xl font-semibold">Variants</h2>
        <p className="text-[color:var(--v2-ink-dim)]">Large size:</p>
        <CodeBlock>{markdownLarge}</CodeBlock>
        <img src={`${base}?size=large`} alt="TrendingRepo badge large example" />
        <p className="text-[color:var(--v2-ink-dim)]">Without rank:</p>
        <CodeBlock>{markdownNoRank}</CodeBlock>
        <img src={`${base}?rank=0`} alt="TrendingRepo badge without rank example" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Supported Query Params</h2>
        <ul className="list-disc space-y-1 pl-6 text-[color:var(--v2-ink-dim)]">
          <li>
            <code>size=small|large</code> (default: <code>small</code>)
          </li>
          <li>
            <code>rank=0</code> hides rank text
          </li>
          <li>
            <code>style=default|amber|success</code> visual style
          </li>
        </ul>
      </section>

      <p className="mt-10 text-sm text-[color:var(--v2-ink-dim)]">
        Need API reference? <Link href="/docs">Open developer docs</Link>.
      </p>
    </main>
  );
}
