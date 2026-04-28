// V2 design-system primitive — vertical barcode-strip ticker.
// Decorative element that suggests "live data flow" — used as a divider or
// hero accent. Stripe widths are derived from a stable seed so it doesn't
// flicker on hydration.

type BarcodeTickerProps = {
  count?: number;
  height?: number;
  seed?: number;
  className?: string;
};

function pseudoRandom(seed: number, i: number): number {
  // Cheap deterministic PRNG — Mulberry32 seeded with `seed * (i+1)`.
  let t = (seed * (i + 1) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function BarcodeTicker({
  count = 64,
  height = 24,
  seed = 220,
  className = "",
}: BarcodeTickerProps) {
  const bars = Array.from({ length: count }, (_, i) => {
    const r = pseudoRandom(seed, i);
    const width = 1 + Math.floor(r * 4);
    const opacity = 0.25 + r * 0.55;
    return { width, opacity, key: i };
  });

  return (
    <div
      aria-hidden
      className={`flex items-stretch gap-[2px] ${className}`.trim()}
      style={{ height }}
    >
      {bars.map((bar) => (
        <span
          key={bar.key}
          style={{
            width: bar.width,
            background: "var(--v2-ink-200)",
            opacity: bar.opacity,
          }}
        />
      ))}
    </div>
  );
}
