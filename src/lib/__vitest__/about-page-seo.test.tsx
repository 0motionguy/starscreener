import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import AboutPage, { metadata } from "@/app/about/page";
import { SITE_URL } from "@/lib/seo";

describe("/about metadata + json-ld", () => {
  it("exports canonical metadata fields for About page", () => {
    const canonical = `${SITE_URL.replace(/\/+$/, "")}/about`;

    expect(metadata.title).toBe("About TrendingRepo");
    expect(metadata.description).toContain("our mission, the team");
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.openGraph?.url).toBe(canonical);
    expect(metadata.openGraph?.title).toBe("About TrendingRepo");
  });

  it("renders one parseable AboutPage JSON-LD script", () => {
    const html = renderToStaticMarkup(<AboutPage />);
    const scriptMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

    expect(scriptMatches).toHaveLength(1);

    const raw = scriptMatches[0]?.[1] ?? "";
    expect(raw.trim().length).toBeGreaterThan(0);

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@type"]).toBe("AboutPage");
    expect(parsed.url).toBe(`${SITE_URL.replace(/\/+$/, "")}/about`);
    expect(parsed.mainEntity).toEqual({
      "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
    });
  });
});
