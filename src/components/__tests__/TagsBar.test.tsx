import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { TagsBar } from "@/components/terminal/TagsBar";
import { useFilterStore } from "@/lib/store";
import { TAG_RULES } from "@/lib/pipeline/classification/tag-rules";

const FIRST_TAG = TAG_RULES[0];
const SECOND_TAG = TAG_RULES[1] ?? TAG_RULES[0];

beforeEach(() => {
  act(() => {
    useFilterStore.getState().setActiveTag(null);
  });
});

afterEach(() => {
  // Without this, prior renders accumulate in document.body and queries
  // like `getByRole("group", ...)` see duplicates.
  cleanup();
});

describe("TagsBar", () => {
  it("renders one button per tag rule", () => {
    const { getAllByRole } = render(<TagsBar />);
    expect(getAllByRole("button").length).toBe(TAG_RULES.length);
  });

  it("each tag's label appears in the rendered output", () => {
    const { getByText } = render(<TagsBar />);
    for (const tag of TAG_RULES) {
      expect(getByText(tag.label)).toBeTruthy();
    }
  });

  it("renders counts only when the counts map provides one for the tag", () => {
    // Only the first tag gets a count entry; every other tag should render
    // no numeric badge. Asserting on the standalone `\d+` count nodes keeps
    // this test honest — the negative branch ("no number for tags without
    // a count") was previously tautological (re-checking that "42" still
    // matched). Now the chip set has exactly one numeric badge.
    const counts = { [FIRST_TAG.tagId]: 42 };
    const { getByText, queryAllByText } = render(<TagsBar counts={counts} />);
    expect(getByText("42")).toBeTruthy();
    const numericBadges = queryAllByText(/^\d+$/);
    expect(numericBadges).toHaveLength(1);
  });

  it("clicking a tag chip writes activeTag into the store", () => {
    const { getByText } = render(<TagsBar />);
    expect(useFilterStore.getState().activeTag).toBeNull();

    act(() => {
      fireEvent.click(getByText(FIRST_TAG.label));
    });
    expect(useFilterStore.getState().activeTag).toBe(FIRST_TAG.tagId);
  });

  it("clicking the active tag again toggles it back to null", () => {
    const { getByText } = render(<TagsBar />);
    act(() => {
      fireEvent.click(getByText(FIRST_TAG.label));
    });
    expect(useFilterStore.getState().activeTag).toBe(FIRST_TAG.tagId);

    act(() => {
      fireEvent.click(getByText(FIRST_TAG.label));
    });
    expect(useFilterStore.getState().activeTag).toBeNull();
  });

  it("aria-pressed reflects active tag state", () => {
    const { getByRole } = render(<TagsBar />);
    const btn = getByRole("button", {
      name: new RegExp(FIRST_TAG.label, "i"),
    });
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      fireEvent.click(btn);
    });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("tooltip (title attr) carries the tag's description", () => {
    const { getByRole } = render(<TagsBar />);
    const btn = getByRole("button", {
      name: new RegExp(FIRST_TAG.label, "i"),
    });
    expect(btn.getAttribute("title")).toBe(FIRST_TAG.description);
  });

  it("active chip border switches onto the brand accent token", () => {
    const { getByRole } = render(<TagsBar />);
    const btn = getByRole("button", {
      name: new RegExp(FIRST_TAG.label, "i"),
    }) as HTMLElement;
    expect(btn.style.borderColor).toContain("--v3-line-200");

    act(() => {
      fireEvent.click(btn);
    });
    expect(btn.style.borderColor).toContain("--v3-acc");
    expect(btn.style.borderColor).not.toContain("--v3-line-200");
  });

  it("group is exposed under the AI-focus-tags label for a11y", () => {
    const { getByRole } = render(<TagsBar />);
    expect(getByRole("group", { name: /ai focus tags/i })).toBeTruthy();
  });
});
