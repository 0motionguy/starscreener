// MaintainersRow — 8 .contrib-avatar chips. Derives deterministic initials
// + color from the github-events actor list (the activity feed is the only
// source of contributor names available on-page today). Falls back to the
// repo's contributor count when no events are present.

import type { NormalizedGithubEvent } from "@/lib/github-events";
import type { Repo } from "@/lib/types";

interface MaintainersRowProps {
  repo: Repo;
  events: NormalizedGithubEvent[];
}

const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#1a1a1a", fg: "#ff6b35" },
  { bg: "#050505", fg: "#ffffff" },
  { bg: "#271a37", fg: "#a78bfa" },
  { bg: "#03263a", fg: "#60a5fa" },
  { bg: "#1d2618", fg: "#22c55e" },
  { bg: "#381c1c", fg: "#ff4d4d" },
  { bg: "#1e1a14", fg: "#ffb547" },
  { bg: "#14241d", fg: "#3ad6c5" },
];

function avatarLabel(login: string): string {
  const clean = login.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length === 0) return "?";
  if (clean.length === 1) return clean.toUpperCase();
  return (clean.charAt(0) + clean.charAt(1)).toUpperCase();
}

function colorFor(login: string, idx: number) {
  return PALETTE[idx % PALETTE.length];
}

export function MaintainersRow({ repo, events }: MaintainersRowProps) {
  const seen = new Map<string, number>();
  for (const e of events) {
    const login = e.actor?.login;
    if (!login || login.endsWith("[bot]")) continue;
    seen.set(login, (seen.get(login) ?? 0) + 1);
  }
  const ordered = Array.from(seen.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([login]) => login);

  if (ordered.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">
            ▌ <b>Maintainers</b> · top contributors
          </h2>
        </div>
        <div
          style={{
            padding: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-faint)",
          }}
        >
          {repo.contributors > 0
            ? `${repo.contributors} total contributors — drill-down coming when the github-events fetcher samples this repo.`
            : "No contributor data yet."}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Maintainers</b> · top contributors
        </h2>
      </div>
      <div className="contrib-row">
        {ordered.map((login, i) => {
          const c = colorFor(login, i);
          return (
            <div
              key={login}
              className="contrib-avatar"
              style={{ background: c.bg, color: c.fg }}
              title={`@${login}`}
            >
              {avatarLabel(login)}
            </div>
          );
        })}
        {repo.contributors > ordered.length ? (
          <span className="more">
            + {(repo.contributors - ordered.length).toLocaleString()} contributors →
          </span>
        ) : null}
      </div>
    </div>
  );
}
