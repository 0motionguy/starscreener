// V3 visual regression — full-page screenshots of canonical V3 surfaces.
//
// These tests are NOT functional smokes (those live one directory up,
// in `tests/e2e/*.spec.ts`). They capture pixel baselines so any
// reskin / accidental layout shift / CSS regression is flagged on CI.
//
// Baselines live under `tests/e2e/visual/__screenshots__/`. Generate or
// refresh with `--update-snapshots`. Subsequent runs diff against the
// baseline; CI fails on > maxDiffPixelRatio.
//
// Stabilization tactics applied per test:
//   1. domcontentloaded → networkidle (cap at 5s) so lazy chunks settle.
//   2. Disable the "live data" dot pulse via injected CSS.
//   3. Mask relative-time fragments (e.g. "2m ago") which tick every
//      minute and would create false-positive diffs.
//   4. Per-test maxDiffPixelRatio: 0.02 absorbs font / antialias jitter.
//
// Hard rules from the task brief: no playwright.config edits, chromium
// only (matches the existing project), no new deps.

import { test, expect, type Page } from "@playwright/test";

// Fixed viewport for every visual test — the baseline is keyed to it,
// so any drift in default device profiles can't silently invalidate
// the snapshots.
const VIEWPORT = { width: 1280, height: 800 };

// Disable any pulsing "live" dot. Both class hooks are used in the
// codebase (.live-dot legacy + .v2-live-dot V3). Animations on these
// dots tick continuously and would otherwise dominate the diff.
const DISABLE_LIVE_DOT_CSS = `
  .live-dot, .v2-live-dot { animation: none !important; }
  /* Belt-and-braces: kill any keyframed pulses on common chrome bits
     that don't change layout but do change pixel values frame-to-frame. */
  .v2-term-bar [class*="pulse"],
  .v2-frame [class*="pulse"] { animation: none !important; }
`;

async function prepareSurface(page: Page, url: string): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Cap networkidle wait so a chatty page (polling, websockets) doesn't
  // burn the whole test budget.
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {
      // Swallow — the surface is allowed to keep low-priority traffic
      // running; we just don't want to wait on it forever.
    });
  await page.addStyleTag({ content: DISABLE_LIVE_DOT_CSS });
}

// "2m ago" / "13s ago" / "4h ago" — the relative-time strings tick
// every minute. Mask them out of the diff. We also mask any element
// tagged with the canonical data-testid so future code paths can opt
// in explicitly.
function relativeTimeMasks(page: Page) {
  return [
    page.locator('[data-testid="updated-at"]'),
    page.getByText(/\b\d+\s*(s|m|h|d)\s*ago\b/i),
  ];
}

test.describe("V3 visual surfaces", () => {
  test("home — hero + BubbleMap + featured row", async ({ page }) => {
    await prepareSurface(page, "/");
    await expect(page).toHaveScreenshot("home.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      mask: relativeTimeMasks(page),
    });
  });

  test("repo detail — V3 18-panel grid (vercel/next.js)", async ({ page }) => {
    await prepareSurface(page, "/repo/vercel/next.js");
    // Repo-detail is the deepest scroll surface — fullPage is mandatory
    // here or the regression coverage collapses to the fold.
    await expect(page).toHaveScreenshot("repo-vercel-next.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      mask: relativeTimeMasks(page),
    });
  });

  test("signals — NewsTopHeaderV3 + per-source bar chart", async ({ page }) => {
    await prepareSurface(page, "/signals");
    await expect(page).toHaveScreenshot("signals.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      mask: relativeTimeMasks(page),
    });
  });

  test("hackernews trending — V3 header + 3 hero feature cards", async ({
    page,
  }) => {
    // The route is /hackernews/trending (the brief's
    // /news/hackernews/trending does not exist — see
    // src/app/hackernews/trending/page.tsx).
    await prepareSurface(page, "/hackernews/trending");
    await expect(page).toHaveScreenshot("hackernews-trending.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      mask: relativeTimeMasks(page),
    });
  });

  test("admin — auth gate (canonical logged-out state)", async ({ page }) => {
    // Logged-in admin state is session-dependent and would flake.
    // The auth gate is the stable surface we lock the baseline against.
    await prepareSurface(page, "/admin");
    await expect(page).toHaveScreenshot("admin-auth-gate.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      mask: relativeTimeMasks(page),
    });
  });
});
