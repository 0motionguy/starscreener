// /news shared scaffolding (APP-05). Color constants, format helpers, and
// the small v2-styled card primitives that every per-source tab uses. Kept
// here so page.tsx + each _tabs/<source>.tsx can import without a circular
// dep.

import Link from "next/link";

export const HN_ORANGE = "#ff6600";
export const BSKY_BLUE = "#0085FF";
export const PH_RED = "#DA552F";

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatAgeHours(ageHours: number | null | undefined): string {
  if (ageHours === undefined || ageHours === null || !Number.isFinite(ageHours))
    return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-md px-4 py-3"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px solid var(--v2-line-200)",
      }}
    >
      <div
        className="v2-mono text-[10px] uppercase tracking-wider"
        style={{ color: "var(--v2-ink-400)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-xl font-bold truncate tabular-nums"
        style={{ color: "var(--v2-ink-100)" }}
      >
        {value}
      </div>
      {hint ? (
        <div
          className="mt-0.5 text-[11px] truncate"
          style={{ color: "var(--v2-ink-400)" }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function ListShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-md overflow-hidden"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px solid var(--v2-line-200)",
      }}
    >
      {children}
    </section>
  );
}

export function FullViewLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-4 text-right">
      <Link
        href={href}
        className="text-xs text-[color:var(--v2-acc)] hover:underline uppercase tracking-wider"
      >
        {label} →
      </Link>
    </div>
  );
}

export function ComingSoonNote({ message }: { message: string }) {
  return (
    <div
      className="mt-4 text-right text-xs"
      style={{ color: "var(--v2-ink-400)" }}
    >
      {`// ${message}`}
    </div>
  );
}

export function ColdCard({
  title,
  body,
  accent,
}: {
  title: string;
  body: React.ReactNode;
  accent?: string;
}) {
  return (
    <section
      className="rounded-md p-8"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px dashed var(--v2-line-300)",
      }}
    >
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: accent || "var(--v2-sig-green)" }}
      >
        {title}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">{body}</p>
    </section>
  );
}
