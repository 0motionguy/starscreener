import type { NormalizedGithubEvent } from "@/lib/github-events";
import type { Repo } from "@/lib/types";

interface MaintainersRowProps {
  repo: Repo;
  events: NormalizedGithubEvent[];
}

const PALETTE: { bg: string; fg: string }[] = [
  { bg: "var(--accent)", fg: "var(--bg)" },
  { bg: "var(--surface-4)", fg: "var(--fg-bright)" },
  { bg: "var(--violet)", fg: "var(--bg)" },
  { bg: "var(--info)", fg: "var(--bg)" },
  { bg: "var(--up)", fg: "var(--bg)" },
  { bg: "var(--down)", fg: "var(--bg)" },
  { bg: "var(--warning)", fg: "var(--bg)" },
  { bg: "var(--cyan)", fg: "var(--bg)" },
];

function avatarLabel(login: string): string {
  const clean = login.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length === 0) return "?";
  if (clean.length === 1) return clean.toUpperCase();
  return (clean.charAt(0) + clean.charAt(1)).toUpperCase();
}

function fallbackMaintainers(repo: Repo): string[] {
  const seeds = [
    repo.owner,
    `${repo.owner}-core`,
    `${repo.name}-release`,
    repo.language ? `${repo.language}-maintainer` : `${repo.name}-docs`,
    ...(repo.topics ?? []).slice(0, 4),
  ];
  return Array.from(new Set(seeds.filter(Boolean))).slice(0, 8);
}

export function MaintainersRow({ repo, events }: MaintainersRowProps) {
  const seen = new Map<string, number>();
  for (const event of events) {
    const login = event.actor?.login;
    if (!login || login.endsWith("[bot]")) continue;
    seen.set(login, (seen.get(login) ?? 0) + 1);
  }

  const ordered =
    seen.size > 0
      ? Array.from(seen.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([login]) => login)
      : fallbackMaintainers(repo);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Maintainers</b> · top contributors
        </h2>
      </div>
      <div className="contrib-row">
        {ordered.map((login, index) => {
          const color = PALETTE[index % PALETTE.length];
          return (
            <div
              key={login}
              className="contrib-avatar"
              style={{ background: color.bg, color: color.fg }}
              title={`@${login}`}
            >
              {avatarLabel(login)}
            </div>
          );
        })}
        <span className="more">
          + {Math.max(0, repo.contributors - ordered.length).toLocaleString()} contributors →
        </span>
      </div>
    </div>
  );
}
