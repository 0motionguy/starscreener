import { afterEach, describe, expect, it, vi } from "vitest";

function setWindowPostHog(posthog: unknown) {
  (window as unknown as { posthog?: unknown }).posthog = posthog;
}

describe("PostHog funnel helper", () => {
  afterEach(() => {
    setWindowPostHog(undefined);
    vi.resetModules();
  });

  it("queues funnel steps until the SDK is ready", async () => {
    const { captureFunnelStep, flushPendingFunnelSteps } = await import(
      "@/lib/analytics/funnel"
    );
    const captures: Array<{ event: string; props: unknown }> = [];

    captureFunnelStep({ step: "home_view", flow: "discover-repo" });
    setWindowPostHog({
      __loaded: true,
      capture: (event: string, props: unknown) => captures.push({ event, props }),
    });
    flushPendingFunnelSteps();

    expect(captures).toEqual([
      {
        event: "funnel_step",
        props: { step: "home_view", flow: "discover-repo" },
      },
    ]);
  });
});
