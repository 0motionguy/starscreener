"use client";

// BuildWalkthrough — 3-step "how this works" strip with persistent dismiss.
//
// Client component (localStorage). Renders identical markup SSR + first
// client paint to avoid hydration mismatch — `dismissed` defaults false on
// SSR, then a useEffect reads localStorage AFTER hydration and may flip it.
// The dismissed flag persists under `trendingrepo-build-walk-dismissed`.

import { useEffect, useState } from "react";

const STORAGE_KEY = "trendingrepo-build-walk-dismissed";

const STEPS = [
  {
    n: "1",
    title: "Connect repo",
    body: "Choose the repo you want to build in public.",
  },
  {
    n: "2",
    title: "Review signals",
    body: "TrendingRepo detects releases, PRs, stars, contributors, issues, and milestones.",
  },
  {
    n: "3",
    title: "Publish update",
    body: "Approve polished updates to your public project timeline.",
  },
];

export function BuildWalkthrough() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      // localStorage may be blocked in private modes; ignore.
    }
  }, []);

  if (dismissed) return null;

  return (
    <section className="walkthrough" id="walkthrough">
      {STEPS.map((step) => (
        <div className="walk-step" key={step.n}>
          <div className="step-num">{step.n}</div>
          <div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </div>
      ))}
      <button
        className="dismiss-btn"
        type="button"
        aria-label="Dismiss walkthrough"
        onClick={() => {
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            // ignore
          }
          setDismissed(true);
        }}
      >
        x
      </button>
    </section>
  );
}
