import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

import { CategoryPill } from "@/components/shared/CategoryPill";
import { CATEGORIES } from "@/lib/constants";

// Pick a known category off the live constant so the test moves with the
// data, not against it. `ai-agents` is the canonical first entry.
const KNOWN = CATEGORIES.find((c) => c.id === "ai-agents")!;

describe("CategoryPill", () => {
  it("renders the category shortName for a known id", () => {
    const { container, getByText } = render(
      <CategoryPill categoryId={KNOWN.id} />,
    );
    expect(getByText(KNOWN.shortName)).toBeTruthy();
    // Outer element is a <span>, not a <div> — it lives inline in dense rows.
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe("SPAN");
  });

  it("returns null for an unknown categoryId", () => {
    const { container } = render(<CategoryPill categoryId="not-a-real-id" />);
    expect(container.firstChild).toBeNull();
  });

  it("default variant carries the category color on its dot", () => {
    const { container } = render(<CategoryPill categoryId={KNOWN.id} />);
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot).toBeTruthy();
    // Tailwind sets backgroundColor inline via the style prop on the dot.
    // Browsers normalize hex → rgb, so check either form.
    const bg = dot.style.backgroundColor.toLowerCase();
    const colorLower = KNOWN.color.toLowerCase();
    const hexMatches = bg === colorLower;
    const rgbMatches = bg.startsWith("rgb");
    expect(hexMatches || rgbMatches).toBe(true);
  });

  it("brand variant uses accent CSS variables instead of the category color", () => {
    const { container } = render(
      <CategoryPill categoryId={KNOWN.id} variant="brand" />,
    );
    const root = container.firstElementChild as HTMLElement;
    // Read the raw `style` attribute — happy-dom strips CSS-var values from
    // shorthand props like `border` once parsed, but preserves them in the
    // attribute string and in longhand-keyed accessors like borderColor.
    const styleAttr = root.getAttribute("style") ?? "";
    expect(styleAttr).toContain("--v3-acc-soft");
    expect(styleAttr).toContain("--v3-acc-dim");
    expect(styleAttr).toContain("--v3-acc");
    // Dot is also tinted by --v3-acc, NOT by category.color.
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.style.background).toContain("--v3-acc");
  });

  it("size=sm and size=md produce different height classes", () => {
    const sm = render(<CategoryPill categoryId={KNOWN.id} size="sm" />);
    const md = render(<CategoryPill categoryId={KNOWN.id} size="md" />);
    const smRoot = sm.container.firstElementChild as HTMLElement;
    const mdRoot = md.container.firstElementChild as HTMLElement;
    expect(smRoot.className).toContain("h-[18px]");
    expect(mdRoot.className).toContain("h-[22px]");
    expect(smRoot.className).not.toContain("h-[22px]");
    expect(mdRoot.className).not.toContain("h-[18px]");
  });

  it("appends user-supplied className", () => {
    const { container } = render(
      <CategoryPill categoryId={KNOWN.id} className="extra-class-x" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("extra-class-x");
  });
});
