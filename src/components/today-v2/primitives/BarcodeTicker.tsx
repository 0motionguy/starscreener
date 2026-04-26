// Industrial barcode ticker — Node/01 closing motif. Used at the bottom
// of stat blocks and the launch section. The barcode is a row of <i>
// tags styled by globals.css (.v2-barcode) — alternating widths/colors
// give the printout feel without any image asset.

interface BarcodeTickerProps {
  /** Left label, e.g. "// LIVE". */
  left?: string;
  /** Optional middle text — typically a region or zone code. */
  middle?: string;
  /** Right label, e.g. "01/007". */
  right?: string;
  /** Number of barcode bars. Default 28. */
  bars?: number;
}

export function BarcodeTicker({
  left = "// LIVE",
  middle,
  right,
  bars = 28,
}: BarcodeTickerProps) {
  return (
    <div className="v2-ticker">
      <span>{left}</span>
      {middle ? <span className="font-variant-numeric:tabular-nums">{middle}</span> : null}
      <span className="v2-barcode" aria-hidden>
        {Array.from({ length: bars }).map((_, i) => (
          <i key={i} />
        ))}
      </span>
      {right ? <span className="font-variant-numeric:tabular-nums ml-auto">{right}</span> : null}
    </div>
  );
}
