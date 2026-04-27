import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useDebouncedSearch } from "../useDebouncedSearch";

// Real timers + short debounce windows. Fake timers fight waitFor's internal
// setTimeout-based polling; with delayMs in the 10-30ms range a real-time
// test still runs in <1s total and keeps the assertions readable.

const SHORT_DELAY = 20;
const SETTLE = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("useDebouncedSearch", () => {
  it("does not fire while the debounce window is open", async () => {
    const fetcher = vi.fn().mockResolvedValue({ hits: [] });
    const { rerender } = renderHook(
      ({ q }: { q: string }) =>
        useDebouncedSearch(q, fetcher, { delayMs: 100 }),
      { initialProps: { q: "" } },
    );

    rerender({ q: "r" });
    rerender({ q: "re" });
    rerender({ q: "rea" });
    // Stay strictly inside the debounce window.
    await sleep(40);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fires after the debounce window with the latest trimmed query", async () => {
    const fetcher = vi.fn().mockResolvedValue({ hits: ["one"] });
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useDebouncedSearch(q, fetcher, { delayMs: SHORT_DELAY }),
      { initialProps: { q: "" } },
    );

    rerender({ q: "  next  " });
    await waitFor(
      () => expect(fetcher).toHaveBeenCalledTimes(1),
      { timeout: SETTLE },
    );
    expect(fetcher).toHaveBeenCalledWith("next", expect.any(AbortSignal));
    await waitFor(
      () => expect(result.current.data).toEqual({ hits: ["one"] }),
      { timeout: SETTLE },
    );
    expect(result.current.debouncedQuery).toBe("next");
  });

  it("aborts the previous in-flight request when the query changes", async () => {
    const seenSignals: AbortSignal[] = [];
    let resolveFirst: (v: unknown) => void = () => {};
    const fetcher = vi.fn(async (q: string, signal: AbortSignal) => {
      seenSignals.push(signal);
      if (q === "first") {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return { hits: [q] };
    });

    const { rerender } = renderHook(
      ({ q }: { q: string }) =>
        useDebouncedSearch(q, fetcher, { delayMs: SHORT_DELAY }),
      { initialProps: { q: "" } },
    );

    rerender({ q: "first" });
    await waitFor(
      () => expect(fetcher).toHaveBeenCalledTimes(1),
      { timeout: SETTLE },
    );
    expect(seenSignals[0]?.aborted).toBe(false);

    rerender({ q: "second" });
    await waitFor(
      () => expect(seenSignals[0]?.aborted).toBe(true),
      { timeout: SETTLE },
    );
    // Resolve the first (now-aborted) request — should NOT pollute data.
    resolveFirst({ hits: ["stale"] });
    await waitFor(
      () => expect(fetcher).toHaveBeenCalledTimes(2),
      { timeout: SETTLE },
    );
  });

  it("respects minChars by skipping short queries", async () => {
    const fetcher = vi.fn().mockResolvedValue({ hits: [] });
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useDebouncedSearch(q, fetcher, { delayMs: SHORT_DELAY, minChars: 3 }),
      { initialProps: { q: "" } },
    );

    rerender({ q: "ab" });
    await sleep(SETTLE);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);

    rerender({ q: "abc" });
    await waitFor(
      () => expect(fetcher).toHaveBeenCalledTimes(1),
      { timeout: SETTLE },
    );
  });

  it("clears state and skips the fetcher when disabled", async () => {
    const fetcher = vi.fn().mockResolvedValue({ hits: [] });
    const { result, rerender } = renderHook(
      ({ q, on }: { q: string; on: boolean }) =>
        useDebouncedSearch(q, fetcher, { delayMs: SHORT_DELAY, enabled: on }),
      { initialProps: { q: "abc", on: true } },
    );

    await waitFor(
      () => expect(fetcher).toHaveBeenCalledTimes(1),
      { timeout: SETTLE },
    );

    rerender({ q: "abc", on: false });
    await sleep(SETTLE);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBeNull();
    expect(result.current.debouncedQuery).toBe("");
  });

  it("surfaces non-Abort errors as Error instances", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useDebouncedSearch(q, fetcher, { delayMs: SHORT_DELAY }),
      { initialProps: { q: "" } },
    );

    rerender({ q: "x" });
    await waitFor(
      () => expect(result.current.error).toBeInstanceOf(Error),
      { timeout: SETTLE },
    );
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.data).toBeNull();
  });
});
