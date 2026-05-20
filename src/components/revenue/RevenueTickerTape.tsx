export interface RevenueSignalTapeItem {
  tag: string;
  label: string;
  value: string;
  tone?: "up" | "flat" | "down";
}

interface RevenueTickerTapeProps {
  items: RevenueSignalTapeItem[];
}

function toneClass(tone: RevenueSignalTapeItem["tone"]): string {
  if (tone === "down" || tone === "flat") return "delta-fl";
  return "delta-up";
}

export function RevenueTickerTape({ items }: RevenueTickerTapeProps) {
  const feed = items.length > 0 ? items : DEFAULT_ITEMS;
  const doubled = [...feed, ...feed];

  return (
    <div className="revenue-signal-tape fade-up" aria-label="Revenue signals">
      <div className="ticker-tape">
        {doubled.map((item, index) => (
          <span className="tick" key={`${item.tag}-${item.label}-${index}`}>
            <span className="tick-tag">{item.tag}</span>
            <b>{item.label}</b>
            <span className={toneClass(item.tone)}>{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_ITEMS: RevenueSignalTapeItem[] = [
  { tag: "MRR", label: "Stan", value: "$3.57M MRR", tone: "up" },
  { tag: "SYNC", label: "TrustMRR", value: "6,323 startups", tone: "flat" },
  { tag: "VERIFY", label: "Founder claims", value: "+4 this week", tone: "up" },
  { tag: "STRIPE", label: "Payment providers", value: "read-only sync", tone: "flat" },
];
