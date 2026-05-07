// /top10 — shared theme tokens.
//
// Single source of truth consumed by:
//   1. the server OG renderer (src/app/api/og/top10/route.tsx) — bakes
//      colors into the downloaded PNG / SVG share card
//   2. the on-page ThemePicker (src/components/top10/Top10Page.tsx) — paints
//      the in-browser CardPreview swatch and the page chrome accent
//
// Both surfaces MUST agree pixel-for-pixel — when the picker shows a Sunset
// preview, the downloaded image has to match, otherwise users land on
// social with a card that doesn't look like the picker promised.
//
// Adding a preset: add the entry below + nothing else. The picker enumerates
// from this map and the OG route deep-merges custom overrides over the base.

export const TOP10_THEME_IDS = [
  "dark",
  "light",
  "mono",
  "sunset",
  "cyberpunk",
  "newsletter",
  "pastel",
  "pitch",
  "hacker",
  "paper",
] as const;

export type Top10ThemeId = (typeof TOP10_THEME_IDS)[number];

export interface ThemeColors {
  /** Canvas / page background. */
  bg: string;
  /** Primary text — headlines, repo names, score numerals. */
  textPrimary: string;
  /** Secondary / supporting text — descriptions, sub-labels, eyebrow. */
  textTertiary: string;
  /** Accent — accent strip, date label, corner ticks, header glyph. */
  brand: string;
  /** Liveness color — LIVE dot, positive deltas, "On fire" badges. */
  up: string;
  /** Top-3 rail colors — colored vertical bar on ranks 1-3. */
  rail1: string;
  rail2: string;
  rail3: string;
  /** Dim rail color for ranks 4+. */
  railRest: string;
  /** Rank number color for ranks 4+. */
  rankRest: string;
  /** Bottom 8px accent strip. */
  accentStrip: string;
}

export interface ThemeMeta {
  id: Top10ThemeId;
  /** Display label in the picker. */
  label: string;
  /** One-line description for tooltips / picker subtitle. */
  blurb: string;
  /** Small swatch shown in the picker before user clicks. */
  swatch: string;
  colors: ThemeColors;
}

/**
 * The 10 ship-with presets. Each is hand-tuned for a specific creator audience:
 *
 *  - dark / light / mono — original 3, balanced operator-feel
 *  - sunset              — warm magazine cover, AI-Twitter creators
 *  - cyberpunk           — neon, gaming/AI launch posts
 *  - newsletter          — high-legibility cream/navy, Substack/Beehiiv
 *  - pastel              — soft IG/lifestyle palette
 *  - pitch               — premium navy/gold for VC decks
 *  - hacker              — green-on-black terminal classic
 *  - paper               — newsprint, no accent — publication-ready
 *
 * All palettes pass WCAG AA on `textPrimary` over `bg` (≥4.5:1 normal text,
 * ≥3:1 large). `textTertiary` is allowed to be ≥3:1 (large text only).
 */
export const TOP10_THEMES: Record<Top10ThemeId, ThemeMeta> = {
  dark: {
    id: "dark",
    label: "Dark",
    blurb: "Operator-terminal feel. Brand orange accent.",
    swatch: "#08090a",
    colors: {
      bg: "#151419",
      textPrimary: "#FBFBFB",
      textTertiary: "#878787",
      brand: "#F56E0F",
      up: "#22C55E",
      rail1: "#ffd24d",
      rail2: "#c0c5cc",
      rail3: "#cd7f32",
      railRest: "rgba(255,255,255,0.10)",
      rankRest: "rgba(255,255,255,0.45)",
      accentStrip: "#F56E0F",
    },
  },
  light: {
    id: "light",
    label: "Light",
    blurb: "High-contrast ivory card. Reads great on LinkedIn / docs.",
    swatch: "#fafaf7",
    colors: {
      bg: "#fafaf7",
      textPrimary: "#0c0d10",
      textTertiary: "#525a63",
      brand: "#F56E0F",
      up: "#15803d",
      rail1: "#d4a017", // muted gold reads better on ivory
      rail2: "#9aa1ab",
      rail3: "#a8702a",
      railRest: "rgba(12,13,16,0.12)",
      rankRest: "rgba(12,13,16,0.42)",
      accentStrip: "#F56E0F",
    },
  },
  mono: {
    id: "mono",
    label: "Minimal",
    blurb: "Brutalist print-zine. Pure greyscale + a single green for liveness.",
    swatch: "#1a1a1a",
    colors: {
      bg: "#000000",
      textPrimary: "#f5f5f5",
      textTertiary: "#9a9a9a",
      brand: "#f5f5f5",
      up: "#b8ff7a",
      rail1: "#ffffff",
      rail2: "#b8b8b8",
      rail3: "#6e6e6e",
      railRest: "rgba(245,245,245,0.10)",
      rankRest: "rgba(245,245,245,0.45)",
      accentStrip: "#f5f5f5",
    },
  },
  sunset: {
    id: "sunset",
    label: "Sunset",
    blurb: "Warm magazine cover. Pink → orange gradient feel.",
    swatch: "#2a0e2c",
    colors: {
      bg: "#1a0a1c",
      textPrimary: "#fff4e0",
      textTertiary: "#d6a8c8",
      brand: "#ff6b9d", // hot pink accent
      up: "#ffd24d",
      rail1: "#ff6b9d",
      rail2: "#ff9f6b",
      rail3: "#ffd24d",
      railRest: "rgba(255,244,224,0.12)",
      rankRest: "rgba(255,244,224,0.50)",
      accentStrip: "#ff6b9d",
    },
  },
  cyberpunk: {
    id: "cyberpunk",
    label: "Cyberpunk",
    blurb: "Neon magenta + cyan on midnight blue. Loud and gamer-y.",
    swatch: "#0a0a2e",
    colors: {
      bg: "#0d0a1f",
      textPrimary: "#e6f7ff",
      textTertiary: "#88a0c8",
      brand: "#ff00ff", // magenta
      up: "#00ffff",    // cyan
      rail1: "#ff00ff",
      rail2: "#00ffff",
      rail3: "#ffff00",
      railRest: "rgba(230,247,255,0.10)",
      rankRest: "rgba(230,247,255,0.45)",
      accentStrip: "#ff00ff",
    },
  },
  newsletter: {
    id: "newsletter",
    label: "Newsletter",
    blurb: "Clean cream + navy. Made for Substack / Beehiiv embeds.",
    swatch: "#f5f1e8",
    colors: {
      bg: "#f5f1e8",
      textPrimary: "#1a2849",
      textTertiary: "#5e6a85",
      brand: "#1a2849",
      up: "#0f7a3e",
      rail1: "#c89b3c",
      rail2: "#9aa1ab",
      rail3: "#a8702a",
      railRest: "rgba(26,40,73,0.14)",
      rankRest: "rgba(26,40,73,0.48)",
      accentStrip: "#1a2849",
    },
  },
  pastel: {
    id: "pastel",
    label: "Pastel",
    blurb: "Soft pinks and blues on off-white. Lifestyle / IG vibe.",
    swatch: "#fef6f9",
    colors: {
      bg: "#fef6f9",
      textPrimary: "#3d2c4f",
      textTertiary: "#8a7494",
      brand: "#d987a4", // dusty pink
      up: "#7ab5a0",    // sage green
      rail1: "#d987a4",
      rail2: "#a8c0d9",
      rail3: "#e8c89c",
      railRest: "rgba(61,44,79,0.12)",
      rankRest: "rgba(61,44,79,0.42)",
      accentStrip: "#d987a4",
    },
  },
  pitch: {
    id: "pitch",
    label: "Pitch deck",
    blurb: "Premium navy + gold. Ready to drop into a VC presentation.",
    swatch: "#0c1730",
    colors: {
      bg: "#0c1730",
      textPrimary: "#ffffff",
      textTertiary: "#9aaccc",
      brand: "#d4af37", // muted gold
      up: "#7ee0a3",
      rail1: "#d4af37",
      rail2: "#c0c5cc",
      rail3: "#a8702a",
      railRest: "rgba(255,255,255,0.10)",
      rankRest: "rgba(255,255,255,0.50)",
      accentStrip: "#d4af37",
    },
  },
  hacker: {
    id: "hacker",
    label: "Hacker",
    blurb: "Phosphor green on black. Terminal classic.",
    swatch: "#000000",
    colors: {
      bg: "#000000",
      textPrimary: "#22ff66",
      textTertiary: "#0a8a3a",
      brand: "#22ff66",
      up: "#22ff66",
      rail1: "#22ff66",
      rail2: "#1ad15a",
      rail3: "#13a047",
      railRest: "rgba(34,255,102,0.14)",
      rankRest: "rgba(34,255,102,0.55)",
      accentStrip: "#22ff66",
    },
  },
  paper: {
    id: "paper",
    label: "Paper",
    blurb: "Newsprint cream and ink. No accent — pure typography.",
    swatch: "#f7f3ec",
    colors: {
      bg: "#f7f3ec",
      textPrimary: "#1a1815",
      textTertiary: "#6a655c",
      brand: "#1a1815",
      up: "#1a1815",
      rail1: "#1a1815",
      rail2: "#5c574e",
      rail3: "#8a8278",
      railRest: "rgba(26,24,21,0.10)",
      rankRest: "rgba(26,24,21,0.40)",
      accentStrip: "#1a1815",
    },
  },
};

export function isValidThemeId(value: unknown): value is Top10ThemeId {
  return (
    typeof value === "string" &&
    (TOP10_THEME_IDS as readonly string[]).includes(value)
  );
}

/**
 * Resolve a theme by id with safe fallback. Lets the URL parser default to
 * `dark` when an unknown / malicious `?theme=` param arrives.
 */
export function resolveTheme(value: unknown): ThemeMeta {
  if (isValidThemeId(value)) return TOP10_THEMES[value];
  return TOP10_THEMES.dark;
}

/**
 * Apply a partial palette override to a base theme. Returns a NEW ThemeMeta;
 * the input is not mutated. Used by the OG renderer when a brand-pack short
 * id (`?b=bp_XXXXXXXX`) supplies custom palette overrides — the rest of the
 * tokens (rails, rankRest, etc.) inherit from the base theme so the user
 * doesn't have to set 11 fields.
 */
export function withPaletteOverride(
  base: ThemeMeta,
  override: Partial<ThemeColors>,
): ThemeMeta {
  return {
    ...base,
    colors: {
      ...base.colors,
      ...override,
    },
  };
}

/**
 * For the on-page ThemePicker — a stable enumeration order for the swatch
 * grid so adding a preset doesn't reshuffle existing positions in users'
 * muscle memory. Mirrors `TOP10_THEME_IDS`.
 */
export const TOP10_THEMES_ORDERED: ThemeMeta[] = TOP10_THEME_IDS.map(
  (id) => TOP10_THEMES[id],
);
