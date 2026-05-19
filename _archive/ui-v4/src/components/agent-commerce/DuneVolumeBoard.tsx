// Agent Commerce — Dune historical volume board.
//
// Daily USDC volume bars + facilitator share. Returns `null` when the Dune
// payload is missing or empty so the surrounding section can fall back to a
// no-data state. All previously-inline colors now resolve via v4 tokens.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

import type { DuneX402VolumeFile } from "@/lib/dune-x402-volume";

interface DuneVolumeBoardProps {
  data: DuneX402VolumeFile | null;
}

const FACILITATOR_COLORS: Record<string, string> = {
  Coinbase: "var(--v4-blue)",
  Heurist: "var(--v4-violet)",
  CodeNut: "var(--v4-amber)",
  Thirdweb: "var(--v4-money)",
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function DuneVolumeBoard({ data }: DuneVolumeBoardProps) {
  if (!data?.rows?.length) return null;

  const byDay = new Map<string, number>();
  const byFac = new Map<string, number>();
  for (const r of data.rows) {
    const v = parseFloat(r.volumeUsdc) || 0;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + v);
    byFac.set(r.facilitator, (byFac.get(r.facilitator) ?? 0) + v);
  }
  const dayEntries = [...byDay.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  const maxDayVol = Math.max(...dayEntries.map(([, v]) => v), 1);
  const facEntries = [...byFac.entries()].sort((a, b) => b[1] - a[1]);
  const totalVol = facEntries.reduce((acc, [, v]) => acc + v, 0);

  return (
    <div className="grid">
      <Card className="col-8">
        <CardHeader
          showCorner
          right={<span>last day · {data.lastDay ?? "—"}</span>}
        >
          Daily USDC volume
        </CardHeader>
        <CardBody>
          <div
            className="ac-dune-bars"
            role="img"
            aria-label={`Daily USDC volume over ${dayEntries.length} days`}
          >
            {dayEntries.map(([day, v]) => {
              const h = Math.max(2, Math.round((v / maxDayVol) * 120));
              return (
                <span
                  key={day}
                  title={`${day} · ${fmtUsd(v)}`}
                  className="ac-dune-bar"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
          <div className="ac-dune-bars-axis">
            <span>{dayEntries[0]?.[0]}</span>
            <span>{dayEntries[dayEntries.length - 1]?.[0]}</span>
          </div>
        </CardBody>
      </Card>
      <Card className="col-4">
        <CardHeader showCorner right={<span>USDC total</span>}>
          Volume by facilitator
        </CardHeader>
        <CardBody>
          {facEntries.map(([name, v]) => {
            const tone = FACILITATOR_COLORS[name] ?? "var(--v4-ink-300)";
            const share = totalVol > 0 ? (v / totalVol) * 100 : 0;
            return (
              <div key={name} className="ac-dune-row">
                <span
                  className="ac-dune-row__name"
                  style={{ color: tone }}
                >
                  {name}
                </span>
                <span className="ac-dune-row__track" aria-hidden>
                  <i
                    style={{
                      width: `${share}%`,
                      background: tone,
                    }}
                  />
                </span>
                <span className="ac-dune-row__value">{fmtUsd(v)}</span>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
