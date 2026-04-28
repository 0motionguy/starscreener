// V2 design-system primitive — ASCII texture divider.
// Decorative <pre> block with a 0/1 noise pattern, masked with a radial
// reveal so a soft accent glow shows through the center.

type AsciiInterstitialProps = {
  rows?: number;
  cols?: number;
  seed?: number;
  density?: number;
  className?: string;
};

function generate(rows: number, cols: number, seed: number, density: number): string {
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    let line = "";
    for (let c = 0; c < cols; c += 1) {
      const v = ((seed * (r + 1) * 1103515245 + c * 12345) >>> 0) / 4294967296;
      if (v < density * 0.5) line += " ";
      else if (v < density) line += ".";
      else if (v < density * 1.6) line += "·";
      else if (v < density * 1.85) line += "░";
      else line += "▓";
    }
    out.push(line);
  }
  return out.join("\n");
}

export function AsciiInterstitial({
  rows = 6,
  cols = 96,
  seed = 220,
  density = 0.55,
  className = "",
}: AsciiInterstitialProps) {
  const content = generate(rows, cols, seed, density);
  return (
    <div
      aria-hidden
      className={`relative w-full overflow-hidden ${className}`.trim()}
      style={{
        maskImage:
          "radial-gradient(ellipse 60% 90% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 60% 90% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
      }}
    >
      <pre className="v2-ascii w-full text-center" style={{ tabSize: 1 }}>
        {content}
      </pre>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 22% 60% at 50% 50%, var(--v2-acc-soft), transparent 70%)",
        }}
      />
    </div>
  );
}
