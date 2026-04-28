// Shared table formatter for the `ss` CLI and the /cli docs page.
//
// Lifted verbatim from cli/ss.mjs (pad/fmtNum/fmtDelta/fmtMomentum) plus
// the renderTable + buildRepoTable pair refactored to RETURN strings
// instead of writing to stdout — that's the one behaviour change. The CLI
// imports these and pipes the returned string into process.stdout.write
// itself; the Next.js server component drops the same string into a <pre>.
//
// Pure ESM, no Node built-ins beyond String. Importable from both the
// .mjs CLI binary and the TS Next page (tsconfig has allowJs +
// moduleResolution=bundler).

export function pad(str, width, align = "left") {
  const s = String(str);
  if (s.length >= width) return s.slice(0, width);
  const gap = " ".repeat(width - s.length);
  return align === "right" ? gap + s : s + gap;
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toLocaleString("en-US");
}

export function fmtDelta(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  if (v === 0) return "0";
  const sign = v > 0 ? "+" : "";
  return sign + v.toLocaleString("en-US");
}

export function fmtMomentum(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toFixed(1);
}

// renderTable now RETURNS a string instead of writing to stdout. Trailing
// newline preserved so callers can append directly without sniffing the
// last char.
export function renderTable(headers, rows, aligns = []) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)),
  );
  const line = (cells) =>
    cells.map((c, i) => pad(c, widths[i], aligns[i] || "left")).join("  ");
  const out = [];
  out.push(line(headers));
  out.push(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) out.push(line(r));
  return out.join("\n") + "\n";
}

// Same shape as the original cli/ss.mjs buildRepoTable — RETURNS the
// rendered table string. Caller decides whether to print it.
export function buildRepoTable(repos, { showRank = true } = {}) {
  const headers = showRank
    ? ["#", "REPO", "STARS", "24H", "7D", "MOMENTUM", "STATUS"]
    : ["REPO", "STARS", "24H", "7D", "MOMENTUM", "STATUS"];
  const aligns = showRank
    ? ["right", "left", "right", "right", "right", "right", "left"]
    : ["left", "right", "right", "right", "right", "left"];
  const rows = repos.map((r, i) => {
    const base = [
      pad(r.fullName || "-", 30),
      fmtNum(r.stars),
      fmtDelta(r.starsDelta24h),
      fmtDelta(r.starsDelta7d),
      fmtMomentum(r.momentumScore),
      r.movementStatus || "-",
    ];
    return showRank ? [String(i + 1), ...base] : base;
  });
  return renderTable(headers, rows, aligns);
}

// Convenience: full transcript shape that `cmdTrending` prints — command
// echo line, "Trending repos (...)" header, blank line, then the table.
// Used by the /cli docs page so the rendered <pre> matches what a visitor
// will see when they actually run `ss trending --window=24h --limit=N`.
export function formatTrendingSession(repos, { windowArg, total } = {}) {
  const limit = repos.length;
  const cmdLine = `$ ss trending --window=${windowArg} --limit=${limit}\n`;
  const header = `Trending repos (window=${windowArg}, showing ${limit} of ${total ?? limit})\n\n`;
  return cmdLine + header + buildRepoTable(repos);
}
