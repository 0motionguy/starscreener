// DropStepStrip — 4-cell step indicator.
//
// `.steps` block from `06-drop-repo.html`. URL contract: `?step=N` where
// N is 1..4. Server component — pure render. Step transitions are
// performed by anchor `<Link>`s so URL state stays the source of truth.

import Link from "next/link";

import type { DropStep } from "@/lib/drop/steps";

const STEPS: ReadonlyArray<{ n: DropStep; head: string; body: string }> = [
  { n: 1, head: "Step 1", body: "Sign in" },
  { n: 2, head: "Step 2", body: "URL + Preview" },
  { n: 3, head: "Step 3", body: "Category + Tags" },
  { n: 4, head: "Step 4", body: "Why · Submit" },
];

interface DropStepStripProps {
  current: DropStep;
  signedIn: boolean;
}

function cls(step: DropStep, current: DropStep, signedIn: boolean): string {
  if (step < current || (step === 1 && signedIn)) return "step done";
  if (step === current) return "step active";
  return "step";
}

function num(step: DropStep, current: DropStep, signedIn: boolean): string {
  const done = step < current || (step === 1 && signedIn);
  return done ? "✓" : String(step);
}

export function DropStepStrip({ current, signedIn }: DropStepStripProps) {
  return (
    <div className="steps" data-step={current}>
      {STEPS.map((s) => {
        const className = cls(s.n, current, signedIn);
        const href = `/drop?step=${s.n}`;
        return (
          <Link key={s.n} href={href} className={className} data-step-cell={s.n}>
            <div className="step-num">{num(s.n, current, signedIn)}</div>
            <div className="step-text">
              {s.head}
              <b>{s.body}</b>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
