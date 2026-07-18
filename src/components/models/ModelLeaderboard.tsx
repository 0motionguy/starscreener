"use client";

// Interactive LLM model leaderboard table. Receives the full catalog as a
// prop from the server page (no fetch here) and does client-side sort/filter
// via the pure helpers in @/lib/models (those are I/O-free, so importing them
// pulls no server-only code into the bundle).

import { useMemo, useState } from "react";

import type { ModelMeta } from "@/lib/llm/types";
import {
  filterModels,
  listProviders,
  sortModels,
  valueScore,
  type ModelSortKey,
} from "@/lib/models";

interface ModelLeaderboardProps {
  models: ModelMeta[];
}

const CAP_OPTIONS: Array<{ key: "tools" | "vision" | "reasoning"; label: string }> = [
  { key: "reasoning", label: "Reasoning" },
  { key: "vision", label: "Vision" },
  { key: "tools", label: "Tools" },
];

const COLUMNS: Array<{ key: ModelSortKey; label: string; align: "left" | "right" }> = [
  { key: "name", label: "Model", align: "left" },
  { key: "provider", label: "Provider", align: "left" },
  { key: "context", label: "Context", align: "right" },
  { key: "input_price", label: "Input $/M", align: "right" },
  { key: "output_price", label: "Output $/M", align: "right" },
  { key: "value", label: "Value", align: "right" },
];

function fmtPrice(v: number): string {
  if (v <= 0) return "free";
  if (v < 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(2)}`;
}

function fmtContext(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function ModelLeaderboard({ models }: ModelLeaderboardProps) {
  const [sort, setSort] = useState<ModelSortKey>("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [provider, setProvider] = useState<string>("");
  const [capability, setCapability] = useState<"" | "tools" | "vision" | "reasoning">("");
  const [search, setSearch] = useState<string>("");

  const providers = useMemo(() => listProviders(models), [models]);

  const rows = useMemo(() => {
    const filtered = filterModels(models, {
      provider: provider || undefined,
      capability: capability || undefined,
      search: search || undefined,
    });
    return sortModels(filtered, sort, dir);
  }, [models, provider, capability, search, sort, dir]);

  function toggleSort(key: ModelSortKey) {
    if (key === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      // Natural best-first: value/context desc, prices asc, text asc.
      setDir(key === "value" || key === "context" ? "desc" : "asc");
    }
  }

  return (
    <div className="ml-wrap">
      <div className="ml-controls">
        <input
          className="ml-search"
          type="search"
          placeholder="Search model or id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search models"
        />
        <select
          className="ml-select"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          aria-label="Filter by provider"
        >
          <option value="">All providers ({models.length})</option>
          {providers.map((p) => (
            <option key={p.provider} value={p.provider}>
              {p.provider} ({p.count})
            </option>
          ))}
        </select>
        <div className="ml-caps" role="group" aria-label="Capability filter">
          {CAP_OPTIONS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`ml-cap ${capability === c.key ? "on" : ""}`}
              aria-pressed={capability === c.key}
              onClick={() => setCapability((v) => (v === c.key ? "" : c.key))}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-scroll">
        <table className="ml-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.align === "right" ? "r" : "l"}
                  aria-sort={
                    sort === col.key
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button type="button" className="ml-th" onClick={() => toggleSort(col.key)}>
                    {col.label}
                    {sort === col.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
              <th className="l">Caps</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.model_id}>
                <td className="l ml-name">{m.name}</td>
                <td className="l ml-prov">{m.provider}</td>
                <td className="r">{fmtContext(m.context_length)}</td>
                <td className="r">{fmtPrice(m.input_price_per_million)}</td>
                <td className="r">{fmtPrice(m.output_price_per_million)}</td>
                <td className="r ml-val">{valueScore(m).toFixed(2)}</td>
                <td className="l ml-badges">
                  {m.supports_reasoning ? <span className="b br" title="Reasoning">R</span> : null}
                  {m.supports_vision ? <span className="b bv" title="Vision">V</span> : null}
                  {m.supports_tools ? <span className="b bt" title="Tools">T</span> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="ml-empty">
                  No models match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="ml-note">
        Showing {rows.length} of {models.length} models. “Value” is a transparent
        capability-per-dollar heuristic (tools/vision/reasoning + context ÷ blended
        price), not a quality benchmark.
      </p>

      <style>{`
        .ml-wrap { display: flex; flex-direction: column; gap: 12px; }
        .ml-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .ml-search, .ml-select {
          background: var(--v4-bg-050, rgba(255,255,255,0.03));
          border: 1px solid var(--v4-line-100, rgba(255,255,255,0.1));
          border-radius: 4px; padding: 7px 10px; color: var(--v4-ink-100, #fff);
          font-size: 13px; font-family: var(--font-geist-mono, monospace);
        }
        .ml-search { flex: 1; min-width: 180px; }
        .ml-caps { display: flex; gap: 6px; }
        .ml-cap {
          border: 1px solid var(--v4-line-100, rgba(255,255,255,0.12));
          background: transparent; color: var(--v4-ink-300, rgba(255,255,255,0.7));
          border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer;
          text-transform: uppercase; letter-spacing: 0.08em;
        }
        .ml-cap.on { color: var(--v4-acc, #5eff80); border-color: var(--v4-acc, #5eff80); }
        .ml-scroll { overflow-x: auto; border: 1px solid var(--v4-line-100, rgba(255,255,255,0.08)); border-radius: 4px; }
        .ml-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ml-table th, .ml-table td { padding: 8px 12px; border-bottom: 1px solid var(--v4-line-050, rgba(255,255,255,0.05)); white-space: nowrap; }
        .ml-table th { position: sticky; top: 0; background: var(--v4-bg-100, #0b0b0d); z-index: 1; }
        .ml-table .r { text-align: right; font-family: var(--font-geist-mono, monospace); }
        .ml-table .l { text-align: left; }
        .ml-th { background: none; border: 0; color: var(--v4-ink-300, rgba(255,255,255,0.7)); cursor: pointer; font: inherit; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; }
        .ml-name { color: var(--v4-ink-000, #fff); font-weight: 500; }
        .ml-prov { color: var(--v4-ink-300, rgba(255,255,255,0.7)); }
        .ml-val { color: var(--v4-acc, #5eff80); }
        .ml-badges .b { display: inline-block; width: 16px; height: 16px; line-height: 16px; text-align: center; border-radius: 3px; font-size: 10px; margin-right: 3px; font-family: var(--font-geist-mono, monospace); }
        .br { background: rgba(94,255,128,0.15); color: #5eff80; }
        .bv { background: rgba(94,180,255,0.15); color: #5eb4ff; }
        .bt { background: rgba(255,200,94,0.15); color: #ffc85e; }
        .ml-empty { text-align: center; color: var(--v4-ink-400, rgba(255,255,255,0.45)); padding: 24px; }
        .ml-note { font-size: 11px; color: var(--v4-ink-400, rgba(255,255,255,0.45)); }
      `}</style>
    </div>
  );
}

export default ModelLeaderboard;
