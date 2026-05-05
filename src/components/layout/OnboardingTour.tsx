"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Step = {
  id: string;
  selector: string;
  title: string;
  body: string;
};

const TOUR_KEY = "trendingrepo-onboarding-tour-v1";

const STEPS: ReadonlyArray<Step> = [
  {
    id: "brand",
    selector: '[aria-label="TrendingRepo home"]',
    title: "You are on the live trend map",
    body: "Use this header link anytime to jump back to the front page.",
  },
  {
    id: "search",
    selector: 'input[placeholder="search repos..."]',
    title: "Find repos fast",
    body: "Press / to focus search, then type a repo, topic, or owner.",
  },
  {
    id: "submit",
    selector: '[aria-label="Drop your repo"]',
    title: "Submit your project",
    body: "Use Drop repo to send a GitHub repo for scoring on future cycles.",
  },
];

export function OnboardingTour() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (pathname !== "/") return;
    try {
      if (window.localStorage.getItem(TOUR_KEY) === "done") return;
      window.localStorage.setItem(TOUR_KEY, "done");
      setVisible(true);
    } catch {
      setVisible(false);
    }
  }, [pathname]);

  const availableSteps = useMemo(
    () =>
      typeof document === "undefined"
        ? []
        :
      STEPS.filter((step) => Boolean(document.querySelector(step.selector))),
    [pathname],
  );

  useEffect(() => {
    if (!visible) return;
    if (availableSteps.length === 0) {
      setVisible(false);
      return;
    }
    if (stepIndex >= availableSteps.length) {
      setStepIndex(availableSteps.length - 1);
    }
  }, [availableSteps, stepIndex, visible]);

  if (!visible || pathname !== "/" || availableSteps.length === 0) return null;

  const step = availableSteps[stepIndex];
  const el = document.querySelector(step.selector) as HTMLElement | null;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const cardWidth = 300;
  const top = Math.min(window.innerHeight - 180, rect.bottom + 10);
  const left = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, rect.left));
  const isLast = stepIndex === availableSteps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/40"
      data-onboarding-tour="root"
      role="dialog"
      aria-label="Onboarding tour"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Skip tour overlay"
        onClick={() => setVisible(false)}
      />
      <div
        className="pointer-events-none absolute rounded-md border"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          borderColor: "var(--v4-acc)",
          boxShadow: "0 0 0 2px rgba(245,158,11,.25)",
        }}
      />
      <section
        className="absolute rounded-lg border px-3 py-3 text-sm shadow-xl"
        data-onboarding-step={step.id}
        style={{
          top,
          left,
          width: cardWidth,
          borderColor: "var(--v4-line-200)",
          background: "var(--v4-bg-000)",
          color: "var(--v4-ink-100)",
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--v4-acc)" }}>
          Step {stepIndex + 1} / {availableSteps.length}
        </p>
        <h2 className="mt-1 text-[14px] font-semibold">{step.title}</h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--v4-ink-300)" }}>
          {step.body}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: "var(--v4-line-200)" }}
            onClick={() => setVisible(false)}
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                style={{ borderColor: "var(--v4-line-200)" }}
                onClick={() => setStepIndex((s) => s - 1)}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="rounded px-2 py-1 text-xs font-medium"
              style={{ background: "var(--v4-acc)", color: "#171717" }}
              onClick={() => {
                if (isLast) {
                  setVisible(false);
                  return;
                }
                setStepIndex((s) => s + 1);
              }}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
