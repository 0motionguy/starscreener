type SystemBarcodeProps = {
  bars?: number;
  height?: number;
  seed?: number;
  label?: string;
  value?: string;
};

function seeded(seed: number, index: number) {
  let n = (seed + index * 2654435761) >>> 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  return (n >>> 0) / 4294967295;
}

export function SystemBarcode({
  bars = 24,
  height = 24,
  seed = 3024,
  label = "// LIVE",
  value,
}: SystemBarcodeProps) {
  return (
    <div className="v3-barcode-wrap">
      <span className="v3-label">{label}</span>
      <div aria-hidden className="v3-barcode" style={{ height }}>
        {Array.from({ length: bars }, (_, index) => {
          const r = seeded(seed, index);
          return (
            <span
              key={index}
              style={{
                width: 1 + Math.floor(r * 4),
                opacity: 0.25 + r * 0.6,
              }}
            />
          );
        })}
      </div>
      {value ? <span className="v3-label">{value}</span> : null}
    </div>
  );
}
