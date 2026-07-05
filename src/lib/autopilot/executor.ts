// Autopilot executor — plays an AutopilotPlan as a cinematic on-page sequence.
//
// It is the generalisation of AskDock's original `runPageOperator` demo into a
// typed step interpreter. Each step resolves a real, stable UI hook and drives
// it, reporting to the AutopilotStage overlay via callbacks (ghost cursor
// target, spotlight rect, narration, status). The overlay owns all the visuals;
// this file owns the choreography + timing. Client-only.

import type { AutopilotPlan, AutopilotStep } from "./types";
import { AUTOPILOT_MAX_STEPS } from "./types";
import {
  clearMarks,
  markLabel,
  prefersReducedMotion,
  scrollToCenter,
  setNativeValue,
  waitForElement,
  waitMs,
} from "./dom";

export interface AutopilotCtx {
  /** router.push — internal navigation. */
  push: (href: string) => void;
  /** Set the narration ribbon text (types out in the overlay). */
  onNarrate: (text: string) => void;
  /** Short transient status ("Switching to Trend"). */
  onStatus: (text: string | null) => void;
  /** Move the ghost cursor to the centre of a rect (null = hide). */
  onCursorTo: (rect: DOMRect | null) => void;
  /** Spotlight (dim everything but) a rect (null = clear). */
  onSpotlight: (rect: DOMRect | null) => void;
  /** Live Toolbox web search → short summary string. */
  webSearch: (query: string) => Promise<string>;
  /** Abort (user closed the HUD / hit Escape). */
  signal?: AbortSignal;
}

// Reduced-motion collapses all dwell timing to near-zero (steps still run, just
// without the cinematic pacing).
const rm = () => prefersReducedMotion();
const beat = (ms: number) => waitMs(rm() ? 0 : ms);

/** Move the cursor to an element and spotlight it. */
async function focusEl(el: HTMLElement | null, ctx: AutopilotCtx): Promise<void> {
  if (!el) return;
  const rect = await scrollToCenter(el);
  ctx.onCursorTo(rect);
  ctx.onSpotlight(rect);
  await beat(560);
}

async function runStep(step: AutopilotStep, ctx: AutopilotCtx): Promise<void> {
  switch (step.kind) {
    case "narrate": {
      ctx.onNarrate(step.text);
      await beat(Math.min(2800, 650 + step.text.length * 20));
      return;
    }

    case "navigate": {
      ctx.onStatus(step.label ? `Opening ${step.label}` : "Navigating");
      ctx.onSpotlight(null);
      ctx.push(step.href);
      await beat(900);
      return;
    }

    case "switchTab": {
      const params = new URLSearchParams();
      if (step.cat && step.cat !== "repos") params.set("cat", step.cat);
      if (step.rank && step.rank !== "top") params.set("rank", step.rank);
      const href = params.toString() ? `/?${params.toString()}` : "/";
      ctx.onStatus(`Switching to ${step.label ?? step.rank ?? step.cat ?? "tab"}`);
      ctx.onSpotlight(null);
      ctx.push(href);
      // Homepage tabs are SSR URL-param nav — wait for the new active pill.
      await waitForElement(".tcb-btn.on", 3500);
      await beat(420);
      return;
    }

    case "fillSearch": {
      const input = await waitForElement(
        'input[role="combobox"][aria-label="Search"], input[aria-label="Search"], input[name="q"]',
        3000,
      );
      if (input instanceof HTMLInputElement) {
        await focusEl(input, ctx);
        input.focus();
        if (rm()) {
          setNativeValue(input, step.query);
        } else {
          for (let i = 1; i <= step.query.length; i += 1) {
            setNativeValue(input, step.query.slice(0, i));
            await waitMs(26);
          }
        }
        await beat(650);
      }
      return;
    }

    case "highlight": {
      const el = await waitForElement(step.selector, 3000);
      await focusEl(el, ctx);
      if (el && step.label) markLabel(el, step.label);
      await beat(720);
      return;
    }

    case "openRepo": {
      ctx.onStatus(`Opening ${step.fullName}`);
      const el = await waitForElement(
        `a[href="/repo/${step.fullName}"], .repo-name[data-repo="${step.fullName}"]`,
        2500,
      );
      await focusEl(el, ctx);
      ctx.onSpotlight(null);
      ctx.push(`/repo/${step.fullName}`);
      await beat(900);
      return;
    }

    case "webSearch": {
      ctx.onStatus("Searching the web via Toolbox");
      ctx.onSpotlight(null);
      const summary = await ctx.webSearch(step.query);
      ctx.onStatus(null);
      ctx.onNarrate(summary);
      await beat(Math.min(3400, 900 + summary.length * 11));
      return;
    }

    case "wait": {
      await beat(Math.min(3000, step.ms));
      return;
    }
  }
}

/**
 * Play a plan. Sequential, abortable, capped at AUTOPILOT_MAX_STEPS. Always
 * tears down the overlay state (spotlight/status/cursor) on exit. Never throws
 * — a failing step logs and the run continues to the next.
 */
export async function runAutopilot(plan: AutopilotPlan, ctx: AutopilotCtx): Promise<void> {
  const aborted = () => ctx.signal?.aborted === true;
  clearMarks();
  try {
    for (const step of plan.steps.slice(0, AUTOPILOT_MAX_STEPS)) {
      if (aborted()) break;
      try {
        await runStep(step, ctx);
      } catch (err) {
        // One bad step shouldn't kill the show.
        console.warn("[autopilot] step failed", step.kind, err);
      }
      if (aborted()) break;
      await beat(340);
    }
  } finally {
    ctx.onSpotlight(null);
    ctx.onCursorTo(null);
    ctx.onStatus(null);
    window.setTimeout(clearMarks, 2600);
  }
}
