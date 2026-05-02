"use client";

// AUDIT-2026-05-04 follow-up: the home page's "Live / top 50" card had
// dead static tabs (All / Repos / Skills / MCP) and no window switcher.
// User asked for a working 24h / 7d / 30d toggle and tab switching under
// the ALL section. This client component owns that interactivity.
//
// Server passes the pre-derived repos + ecosystem boards (skills, mcp).
// We sort client-side because the dataset is small (top ~50) and the
// toggle is a tight feedback loop.

import { useMemo, useState } from "react";
import type { Repo } from "@/lib/types";

export type LiveWindow = "24h" | "7d" | "30d";
export type LiveTab = "all" | "repos" | "skills" | "mcp";

export interface LiveSkill {
  id: string;
  name: string;
  href: string;
  sub: string;
  score: number;
  delta24h: number;
  delta7d: number;
  delta30d: number;
}

export interface LiveMcp {
  id: string;
  name: string;
  href: string;
  sub: string;
  score: number;
  delta24h: number;
  delta7d: number;
  delta30d: number;
}

interface Props {
  repos: Repo[];
  skills: LiveSkill[];
  mcps: LiveMcp[];
  limit?: number;
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatDelta(value: number): string {
  const abs = formatCompact(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

function deltaForWindow(repo: Repo, w: LiveWindow): number {
  if (w === "24h") return repo.starsDelta24h;
  if (w === "7d") return repo.starsDelta7d;
  return repo.starsDelta30d;
}

function skillDeltaForWindow(item: LiveSkill | LiveMcp, w: LiveWindow): number {
  if (w === "24h") return item.delta24h;
  if (w === "7d") return item.delta7d;
  return item.delta30d;
}

export function LiveTopTable({ repos, skills, mcps, limit = 15 }: Props) {
  const [tab, setTab] = useState<LiveTab>("all");
  const [win, setWin] = useState<LiveWindow>("24h");

  const sortedRepos = useMemo(
    () => [...repos].sort((a, b) => deltaForWindow(b, win) - deltaForWindow(a, win)),
    [repos, win],
  );
  const sortedSkills = useMemo(
    () =>
      [...skills].sort(
        (a, b) => skillDeltaForWindow(b, win) - skillDeltaForWindow(a, win),
      ),
    [skills, win],
  );
  const sortedMcps = useMemo(
    () =>
      [...mcps].sort(
        (a, b) => skillDeltaForWindow(b, win) - skillDeltaForWindow(a, win),
      ),
    [mcps, win],
  );

  return (
    <>
      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === "all" ? " on" : ""}`}
          onClick={() => setTab("all")}
        >
          All<span className="ct">{repos.length + skills.length + mcps.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "repos" ? " on" : ""}`}
          onClick={() => setTab("repos")}
        >
          Repos<span className="ct">{repos.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "skills" ? " on" : ""}`}
          onClick={() => setTab("skills")}
        >
          Skills<span className="ct">{skills.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "mcp" ? " on" : ""}`}
          onClick={() => setTab("mcp")}
        >
          MCP<span className="ct">{mcps.length}</span>
        </button>
        <span className="right">
          <span className="win-group" role="group" aria-label="Window">
            {(["24h", "7d", "30d"] as const).map((w) => (
              <button
                key={w}
                type="button"
                className={`tab win-tab${win === w ? " on" : ""}`}
                onClick={() => setWin(w)}
              >
                {w}
              </button>
            ))}
          </span>
          <span className="live">live</span>
        </span>
      </div>
      <div className="table-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th className="num">Stars</th>
              <th className="num">{win === "24h" ? "24h" : win === "7d" ? "7d" : "30d"}</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {(tab === "all" || tab === "repos") &&
              sortedRepos.slice(0, limit).map((repo, index) => {
                const delta = deltaForWindow(repo, win);
                return (
                  <tr key={`r-${repo.id}`}>
                    <td>{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <a href={`/repo/${repo.owner}/${repo.name}`}>
                        <span>{repo.fullName}</span>
                        <small>repo / {repo.language ?? "mixed"}</small>
                      </a>
                    </td>
                    <td className="num">{formatCompact(repo.stars)}</td>
                    <td className={`num ${delta >= 0 ? "up" : "dn"}`}>{formatDelta(delta)}</td>
                    <td className="num">{repo.momentumScore.toFixed(1)}</td>
                  </tr>
                );
              })}
            {(tab === "all" || tab === "skills") &&
              sortedSkills.slice(0, limit).map((item, index) => {
                const delta = skillDeltaForWindow(item, win);
                return (
                  <tr key={`s-${item.id}`}>
                    <td>{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <a href={item.href}>
                        <span>{item.name}</span>
                        <small>skill / {item.sub}</small>
                      </a>
                    </td>
                    <td className="num">—</td>
                    <td className={`num ${delta >= 0 ? "up" : "dn"}`}>{formatDelta(delta)}</td>
                    <td className="num">{item.score.toFixed(1)}</td>
                  </tr>
                );
              })}
            {(tab === "all" || tab === "mcp") &&
              sortedMcps.slice(0, limit).map((item, index) => {
                const delta = skillDeltaForWindow(item, win);
                return (
                  <tr key={`m-${item.id}`}>
                    <td>{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <a href={item.href}>
                        <span>{item.name}</span>
                        <small>mcp / {item.sub}</small>
                      </a>
                    </td>
                    <td className="num">—</td>
                    <td className={`num ${delta >= 0 ? "up" : "dn"}`}>{formatDelta(delta)}</td>
                    <td className="num">{item.score.toFixed(1)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}
