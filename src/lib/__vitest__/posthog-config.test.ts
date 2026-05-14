import { describe, expect, it } from "vitest";

import {
  DEFAULT_POSTHOG_HOST,
  normalizePostHogHost,
  resolvePublicPostHogConfig,
  resolveServerPostHogConfig,
} from "@/lib/analytics/posthog-config";

describe("PostHog config", () => {
  it("trims env host values and removes trailing slashes", () => {
    expect(normalizePostHogHost("https://us.i.posthog.com\r\n/")).toBe(
      "https://us.i.posthog.com",
    );
  });

  it("falls back to the US ingestion host", () => {
    expect(normalizePostHogHost(" \n\t ")).toBe(DEFAULT_POSTHOG_HOST);
  });

  it("accepts either server PostHog key env name", () => {
    expect(
      resolveServerPostHogConfig({
        POSTHOG_API_KEY: " api-key ",
        POSTHOG_HOST: " https://us.i.posthog.com\n",
      }).key,
    ).toBe("api-key");
  });

  it("accepts both repo and docs public token env names", () => {
    expect(
      resolvePublicPostHogConfig({
        NEXT_PUBLIC_POSTHOG_TOKEN: " docs-token ",
        NEXT_PUBLIC_POSTHOG_HOST: " https://us.i.posthog.com\n",
      }),
    ).toEqual({
      key: "docs-token",
      host: "https://us.i.posthog.com",
    });

    expect(
      resolvePublicPostHogConfig({
        NEXT_PUBLIC_POSTHOG_KEY: " repo-key ",
        NEXT_PUBLIC_POSTHOG_TOKEN: " docs-token ",
      }).key,
    ).toBe("repo-key");
  });
});
