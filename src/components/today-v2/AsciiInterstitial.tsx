// ASCII texture interstitial — Node/01 decorative restraint applied
// once per page, between Signals and Launch. The radial orange glow at
// the center of the texture is the only place where the brand color is
// allowed to "bloom" without indicating an active object.
//
// Pattern is fully static — generated at build time, no client JS.

const ASCII_LINES = [
  "001101 11 1 1 11 0  1 1  111 0011 11 11   1  1 1  1 1 0011  111 1 1 1 11 0  1 1",
  "1 11   01  1 1 1 1  111 1011 11  1 1 1 11   01  1 1 1 1  111 1011 1 1 1 1  111",
  " 1  1  111 0011 11 11   1  1 1  1 1 0011 11 11   1  1 1  1 1 0011 11   1  1 1",
  "01 1  1 1 11   01  1 1 1 1  111 1011 11  1 1 1 11   01  1 1 1 1  111 1011 11  1",
  " 1 11 11 0011 11 11   1  1 1  1 1 0011 11 11   1  1 1  1 1 0011 11 11   1  1 1",
  "11   01  1 1 1 1  111 1011 1 1 1 1  111 1011 1 1 1 1  111 1011 11  1 1 1 11   0",
  " 11   1  1 1  1 1 0011 11   1  1 1  1 1 0011 11   1  1 1  1 1 0011 11   1  1 1",
  "1  111 1011 11  1 1 1 11   01  1 1 1 1  111 1011 11  1 1 1 11   01  1 1 1 1  11",
  " 0011 11 11   1  1 1  1 1 0011 11 11   1  1 1  1 1 0011 11 11   1  1 1  1 1 001",
  " 1 1 1 1  111 1011 1 1 1 1  111 1011 1 1 1 1  111 1011 11  1 1 1 11   01  1 1 1",
  " 1 1 0011 11   1  1 1  1 1 0011 11   1  1 1  1 1 0011 11   1  1 1  1 1 0011 11",
  "01  1 1 1 1  111 1011 11  1 1 1 11   01  1 1 1 1  111 1011 1 1 1 1  111 1011",
  "1 11 11 0011 11 11   1  1 1  1 1 0011 11 11   1  1 1  1 1 0011 11 11   1  1 1",
];

export function AsciiInterstitial() {
  return (
    <div className="border-b border-[color:var(--v2-line-100)]">
      <div className="v2-frame py-8">
        <pre
          className="v2-ascii"
          aria-hidden
          style={{ height: 220 }}
        >
          {ASCII_LINES.join("\n")}
        </pre>
        <div className="mt-3 flex items-center justify-between v2-mono">
          <span>
            <span aria-hidden>{"// "}</span>
            FIELD · 13 × 78 · DENSITY 0.67
          </span>
          <span className="text-[color:var(--v2-ink-400)]">
            {"// "}END SECTION ▮
          </span>
        </div>
      </div>
    </div>
  );
}
