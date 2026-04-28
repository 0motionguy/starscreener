import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useWindowWidth } from "../useWindowWidth";

function setWindowWidth(px: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: px,
  });
}

function fireResize(): void {
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  // Restore a sane width so test order doesn't matter.
  setWindowWidth(1024);
});

describe("useWindowWidth", () => {
  it("returns the current innerWidth on first render", () => {
    setWindowWidth(960);
    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBe(960);
  });

  it("updates when the window emits a resize event", async () => {
    setWindowWidth(800);
    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBe(800);

    await act(async () => {
      setWindowWidth(1200);
      fireResize();
      // Wait one rAF tick so the coalesced setState fires.
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    });

    expect(result.current).toBe(1200);
  });

  it("coalesces a burst of resize events into one render", async () => {
    setWindowWidth(640);
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useWindowWidth();
    });
    const initialRenders = renders;
    expect(result.current).toBe(640);

    await act(async () => {
      // Simulate a burst — 50 resize events landing inside one frame.
      // The rAF coalesce must collapse them into a single setState.
      for (let i = 0; i < 50; i += 1) {
        setWindowWidth(641 + i);
        fireResize();
      }
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    });

    expect(result.current).toBe(690);
    // One render for the coalesced setState. (StrictMode can double; allow
    // up to 2 additional renders to keep the test resilient.)
    expect(renders - initialRenders).toBeLessThanOrEqual(2);
  });

  it("removes the resize listener on unmount", () => {
    setWindowWidth(700);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useWindowWidth());
    unmount();
    const removed = removeSpy.mock.calls.some(
      ([event]) => event === "resize",
    );
    expect(removed).toBe(true);
  });
});
