import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TrendingRepo - Hackathons",
  description: "Weekly hackathons list for W18-W27 2026.",
  alternates: { canonical: "/hackathons" },
};

type Hackathon = {
  name: string;
  prize: string;
  mode: "ONLINE" | "ONSITE" | "HYBRID";
  weekRange: string;
};

const HACKATHONS: Hackathon[] = [
  {
    name: "Mantle Turing Test Hackathon 2026 Phase 2: AI Awakening",
    prize: "$100K",
    mode: "ONLINE",
    weekRange: "W18-W25",
  },
  {
    name: "Prompt a Startup 2026 (Polar.sh x Lovable)",
    prize: "$10K",
    mode: "ONLINE",
    weekRange: "W18-W19",
  },
  {
    name: "EasyA x Consensus Miami Hackathon",
    prize: "$200K",
    mode: "ONSITE",
    weekRange: "W18-W19",
  },
  {
    name: "Sui Overflow 2026",
    prize: "$1M+ (prior edition benchmark)",
    mode: "ONLINE",
    weekRange: "W19-W23",
  },
  {
    name: "NandaHack: Agentic AI Hackathon Phase 2",
    prize: "Undisclosed",
    mode: "HYBRID",
    weekRange: "W19-W24",
  },
  { name: "ETHPrague 2026", prize: "Undisclosed", mode: "ONSITE", weekRange: "W19" },
  {
    name: "Solana Frontier Hackathon",
    prize: "$2.75M",
    mode: "ONLINE",
    weekRange: "W19-W20",
  },
  {
    name: "AI Agent Olympics (Milan AI Week)",
    prize: "$28K+",
    mode: "HYBRID",
    weekRange: "W20-W21",
  },
  {
    name: "QIE Blockchain Hackathon 2026",
    prize: "$20K",
    mode: "ONLINE",
    weekRange: "W20",
  },
  {
    name: "UC Berkeley AI Hackathon 2026",
    prize: "$100K",
    mode: "ONSITE",
    weekRange: "W20-W25",
  },
  {
    name: "Gemma 4 Good Hackathon (Google DeepMind x Kaggle)",
    prize: "$200K",
    mode: "ONLINE",
    weekRange: "W20",
  },
  {
    name: "Anthropic AI Hackathon (lablab.ai)",
    prize: "Undisclosed",
    mode: "ONLINE",
    weekRange: "W22-W23",
  },
  {
    name: "DevNetwork AI + ML Hackathon 2026",
    prize: "$12.5K+",
    mode: "HYBRID",
    weekRange: "W20-W22",
  },
  {
    name: "The Bags Hackathon",
    prize: "$1M grant pool",
    mode: "ONLINE",
    weekRange: "W18-W22",
  },
  {
    name: "USAII Global AI Hackathon 2026",
    prize: "$15K",
    mode: "ONLINE",
    weekRange: "W20-W25",
  },
  {
    name: "AWS Prompt the Planet Challenge",
    prize: "$50K (AWS credits)",
    mode: "ONLINE",
    weekRange: "W11-W24",
  },
  {
    name: "Google Cloud Rapid Agent Hackathon",
    prize: "Undisclosed",
    mode: "ONLINE",
    weekRange: "W20-W24",
  },
  {
    name: "ETHGlobal New York 2026",
    prize: "Undisclosed",
    mode: "ONSITE",
    weekRange: "W24",
  },
  {
    name: "FlagOS Open Computing Global Challenge S1",
    prize: "2,000,000 RMB",
    mode: "ONLINE",
    weekRange: "W18-W23",
  },
  {
    name: "AI Coding Agents Hackathon (Anthropic x Y Combinator)",
    prize: "Undisclosed",
    mode: "ONSITE",
    weekRange: "W27",
  },
];

export default function HackathonsPage() {
  return (
    <main className="home-surface">
      <section className="mb-6">
        <p className="v2-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--v4-ink-300)]">
          Hackathons / W18-W27 2026
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--v4-ink-000)]">
          Hackathons
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--v4-ink-300)]">
          20 hackathons across W18-W27 2026.
        </p>
      </section>

      <section
        className="overflow-hidden rounded-[2px] border"
        style={{ borderColor: "var(--v4-line-100)" }}
      >
        <div
          className="grid grid-cols-[1fr_auto_auto] gap-2 border-b px-4 py-2 text-[11px] uppercase tracking-[0.14em]"
          style={{ borderColor: "var(--v4-line-100)", color: "var(--v4-ink-400)" }}
        >
          <span>Name</span>
          <span>Prize / Mode</span>
          <span>Week</span>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v4-line-100)" }}>
          {HACKATHONS.map((item, idx) => (
            <li
              key={`${item.name}-${idx}`}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <span className="min-w-[220px] flex-1 text-sm text-[color:var(--v4-ink-100)]">
                {item.name}
              </span>
              <span className="min-w-[170px] text-right text-xs text-[color:var(--v4-ink-300)]">
                {item.prize} · {item.mode}
              </span>
              <span className="v2-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--v4-ink-400)]">
                {item.weekRange}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
