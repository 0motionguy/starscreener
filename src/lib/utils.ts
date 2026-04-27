// StarScreener — Utility functions

/**
 * Merge CSS class names, filtering out falsy values.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Format a number for display: 1000 -> "1k", 45200 -> "45.2k", 1500000 -> "1.5M"
 */
export function formatNumber(n: number): string {
  if (n < 0) return `-${formatNumber(-n)}`;
  if (n < 1000) return n.toString();
  if (n < 10_000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  if (n < 1_000_000) {
    const k = n / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${parseFloat(k.toFixed(1))}k`;
  }
  if (n < 1_000_000_000) {
    const m = n / 1_000_000;
    return m >= 100 ? `${Math.round(m)}M` : `${parseFloat(m.toFixed(1))}M`;
  }
  const b = n / 1_000_000_000;
  return `${parseFloat(b.toFixed(1))}B`;
}

/**
 * Format a delta as a percentage string: positive -> "+12.5%", negative -> "-3.2%"
 */
export function formatDelta(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/**
 * Get relative time string from an ISO date: "2m ago", "3h ago", "2d ago"
 */
export function getRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/**
 * Convert a full repo name to a slug ID: "vercel/next.js" -> "vercel--next-js"
 */
export function slugToId(fullName: string): string {
  return fullName
    .replace(/\//g, "--")
    .replace(/\./g, "-")
    .replace(/[^a-zA-Z0-9\-]/g, "")
    .toLowerCase();
}

/**
 * Convert a slug ID back to a full repo name: "vercel--next-js" -> "vercel/next.js"
 *
 * Note: This is a best-effort reverse — dots in original names are lost in the slug
 * and cannot be perfectly reconstructed. The canonical mapping lives in mock data.
 */
export function idToSlug(id: string): string {
  // Split on the double-dash separator (owner--name)
  const parts = id.split("--");
  if (parts.length !== 2) return id;
  return `${parts[0]}/${parts[1]}`;
}

/**
 * Get a CSS color variable name based on momentum score ranges.
 *
 * Returns Tailwind-compatible color token strings.
 */
export function getMomentumColor(score: number): string {
  if (score >= 80) return "text-heat-hot"; // hot — Liquid Lava
  if (score >= 60) return "text-heat-warm"; // warm — amber
  if (score >= 40) return "text-heat-neutral"; // neutral
  if (score >= 20) return "text-heat-cool"; // cool — blue
  return "text-text-muted"; // cold — V3 muted ink
}

/**
 * Get a human-readable label for a momentum score.
 */
export function getMomentumLabel(score: number): string {
  if (score >= 80) return "Hot";
  if (score >= 60) return "Warm";
  if (score >= 40) return "Neutral";
  if (score >= 20) return "Cool";
  return "Cold";
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pick a deterministic pseudo-random number from a seed string.
 * Useful for generating stable "random" data from repo IDs.
 */
export function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h ^ (h >>> 16)) * 0x45d9f3b;
    h = (h ^ (h >>> 16)) * 0x45d9f3b;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  };
}
