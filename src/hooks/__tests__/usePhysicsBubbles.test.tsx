import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { usePhysicsBubbles, type PhysicsSeed } from "../usePhysicsBubbles";

// Identity-transform stubs for happy-dom's missing SVG matrix surface.
// The hook does: svg.createSVGPoint() → set .x/.y → matrixTransform(ctm.inverse())
// Under an identity CTM the transformed point equals the input — perfect
// for asserting click/drag behavior without dragging in matrix math.
function attachIdentitySvgStubs(svg: SVGSVGElement): void {
  type StubPoint = { x: number; y: number; matrixTransform: (m: unknown) => StubPoint };
  const identity = { inverse: () => identity };
  Object.assign(svg, {
    createSVGPoint: (): StubPoint => {
      const p: StubPoint = {
        x: 0,
        y: 0,
        matrixTransform: () => p,
      };
      return p;
    },
    getScreenCTM: () => identity,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
}

interface TestSeed extends PhysicsSeed {
  label: string;
}

const SEEDS_A: TestSeed[] = [
  { id: "a", cx: 100, cy: 100, r: 20, label: "A" },
  { id: "b", cx: 200, cy: 100, r: 30, label: "B" },
];

const SEEDS_B: TestSeed[] = [
  { id: "c", cx: 50, cy: 50, r: 10, label: "C" },
];

let rafSpy: MockInstance<(callback: FrameRequestCallback) => number>;
let cancelSpy: MockInstance<(handle: number) => void>;

beforeEach(() => {
  // Stub rAF so wakeSim() doesn't actually loop in the test runner —
  // we only care that the lifecycle hooks invoke / cancel it correctly.
  rafSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation(() => 1 as unknown as number);
  cancelSpy = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
});

describe("usePhysicsBubbles", () => {
  it("initializes bodies from seeds with zero velocity and not held", () => {
    const { result } = renderHook(() =>
      usePhysicsBubbles({ seeds: SEEDS_A, width: 600, height: 400 }),
    );

    const bodies = result.current.bodies.current;
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      id: "a",
      cx: 100,
      cy: 100,
      r: 20,
      vx: 0,
      vy: 0,
      held: false,
    });
    expect(bodies[1]).toMatchObject({ id: "b", cx: 200, cy: 100, r: 30 });
    expect(result.current.draggingId).toBeNull();
  });

  it("default resetBodies snaps to the new seed list when seeds change", () => {
    const { result, rerender } = renderHook(
      ({ seeds }: { seeds: TestSeed[] }) =>
        usePhysicsBubbles({ seeds, width: 600, height: 400 }),
      { initialProps: { seeds: SEEDS_A } },
    );

    expect(result.current.bodies.current.map((b) => b.id)).toEqual(["a", "b"]);

    rerender({ seeds: SEEDS_B });
    expect(result.current.bodies.current.map((b) => b.id)).toEqual(["c"]);
    expect(result.current.bodies.current[0]).toMatchObject({
      cx: 50,
      cy: 50,
      vx: 0,
      vy: 0,
    });
  });

  it("custom resetBodies receives the prior bodies + new seeds and its result wins", () => {
    const reset = vi.fn((_prev, seeds: TestSeed[]) =>
      seeds.map((s) => ({ ...s, vx: 99, vy: 99, held: true })),
    );

    const { result, rerender } = renderHook(
      ({ seeds }: { seeds: TestSeed[] }) =>
        usePhysicsBubbles({
          seeds,
          width: 600,
          height: 400,
          resetBodies: reset,
        }),
      { initialProps: { seeds: SEEDS_A } },
    );

    rerender({ seeds: SEEDS_B });
    expect(reset).toHaveBeenCalled();
    const lastCall = reset.mock.calls[reset.mock.calls.length - 1];
    expect(lastCall?.[0].map((b: { id: string }) => b.id)).toEqual([
      "a",
      "b",
    ]);
    expect(lastCall?.[1]).toBe(SEEDS_B);
    expect(result.current.bodies.current[0]).toMatchObject({
      id: "c",
      vx: 99,
      vy: 99,
      held: true,
    });
  });

  it("wakeOnSeedChange schedules a rAF on initial mount", () => {
    rafSpy.mockClear();
    renderHook(() =>
      usePhysicsBubbles({
        seeds: SEEDS_A,
        width: 600,
        height: 400,
        wakeOnSeedChange: true,
      }),
    );
    // The seed-change effect runs on mount with wakeOnSeedChange=true →
    // wakeSim() → first rAF scheduled. Subsequent calls early-return on
    // the in-flight rafRef so we only assert the first invocation.
    expect(rafSpy).toHaveBeenCalled();
  });

  it("wakeOnSeedChange=false does NOT schedule a rAF on mount", () => {
    rafSpy.mockClear();
    renderHook(() =>
      usePhysicsBubbles({ seeds: SEEDS_A, width: 600, height: 400 }),
    );
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("wakeSim() called twice in a row schedules only one rAF", () => {
    const { result } = renderHook(() =>
      usePhysicsBubbles({ seeds: SEEDS_A, width: 600, height: 400 }),
    );

    rafSpy.mockClear();
    act(() => {
      result.current.wakeSim();
      result.current.wakeSim();
    });
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("pointer-down with no SVG ref attached is a safe no-op", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() =>
      usePhysicsBubbles({
        seeds: SEEDS_A,
        width: 600,
        height: 400,
        onClick,
      }),
    );

    // svgRef.current is null → toSvgCoords returns null → handler returns
    // early. Must not throw, must not mutate draggingId.
    const fakeEvent = {
      clientX: 150,
      clientY: 150,
      pointerId: 1,
    } as unknown as React.PointerEvent<SVGGElement>;

    expect(() =>
      result.current.handlePointerDown(fakeEvent, "a"),
    ).not.toThrow();
    expect(result.current.draggingId).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("cancels any in-flight rAF on unmount", () => {
    const { result, unmount } = renderHook(() =>
      usePhysicsBubbles({ seeds: SEEDS_A, width: 600, height: 400 }),
    );

    // Schedule a frame so the cleanup has something to cancel.
    act(() => {
      result.current.wakeSim();
    });

    cancelSpy.mockClear();
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  // Click-vs-drag detection — pointer-down + tiny move + pointer-up should
  // fire onClick; pointer-down + large move + pointer-up should NOT.
  // Mounts a real SVG so the ref is attached, then shims the SVG matrix
  // surface happy-dom doesn't implement.
  it("pointer-down + small movement + up fires onClick (click)", () => {
    const onClick = vi.fn();

    function Harness() {
      const harness = useRef<{
        hook: ReturnType<typeof usePhysicsBubbles<TestSeed>>;
      }>({} as never);
      const hook = usePhysicsBubbles({
        seeds: SEEDS_A,
        width: 600,
        height: 400,
        onClick,
      });
      harness.current.hook = hook;
      // Expose to the test via a window pin — renderHook would lose access
      // after the render boundary.
      (
        globalThis as unknown as Record<string, unknown>
      ).__physicsHarness = harness.current;
      return (
        <svg
          ref={hook.svgRef}
          width={600}
          height={400}
          data-testid="svg-root"
        >
          <g
            ref={(el) => {
              hook.groupRefs.current["a"] = el;
            }}
          />
        </svg>
      );
    }

    const { container } = render(<Harness />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    attachIdentitySvgStubs(svg);

    const harness = (
      globalThis as unknown as {
        __physicsHarness: {
          hook: ReturnType<typeof usePhysicsBubbles<TestSeed>>;
        };
      }
    ).__physicsHarness;

    // body "a" is at cx=100, cy=100. Click on the body's center, move 1px,
    // release. Movement budget < 5px → click fires.
    act(() => {
      harness.hook.handlePointerDown(
        { clientX: 100, clientY: 100, pointerId: 1 } as ReactPointerEvent<SVGGElement>,
        "a",
      );
    });
    act(() => {
      harness.hook.handlePointerMove({
        clientX: 101,
        clientY: 100,
      } as ReactPointerEvent<SVGSVGElement>);
    });
    act(() => {
      harness.hook.handlePointerUp({
        clientX: 101,
        clientY: 100,
      } as ReactPointerEvent<SVGSVGElement>);
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(SEEDS_A[0]);
  });

  it("pointer-down + large drag + up does NOT fire onClick", () => {
    const onClick = vi.fn();

    function Harness() {
      const hook = usePhysicsBubbles({
        seeds: SEEDS_A,
        width: 600,
        height: 400,
        onClick,
      });
      (
        globalThis as unknown as Record<string, unknown>
      ).__physicsHarness = { hook };
      return (
        <svg ref={hook.svgRef} width={600} height={400}>
          <g
            ref={(el) => {
              hook.groupRefs.current["a"] = el;
            }}
          />
        </svg>
      );
    }

    const { container } = render(<Harness />);
    attachIdentitySvgStubs(container.querySelector("svg") as SVGSVGElement);

    const harness = (
      globalThis as unknown as {
        __physicsHarness: {
          hook: ReturnType<typeof usePhysicsBubbles<TestSeed>>;
        };
      }
    ).__physicsHarness;

    // 50px drag → far above the 5px threshold → click suppressed.
    act(() => {
      harness.hook.handlePointerDown(
        { clientX: 100, clientY: 100, pointerId: 1 } as ReactPointerEvent<SVGGElement>,
        "a",
      );
    });
    act(() => {
      harness.hook.handlePointerMove({
        clientX: 150,
        clientY: 100,
      } as ReactPointerEvent<SVGSVGElement>);
    });
    act(() => {
      harness.hook.handlePointerUp({
        clientX: 150,
        clientY: 100,
      } as ReactPointerEvent<SVGSVGElement>);
    });

    expect(onClick).not.toHaveBeenCalled();
  });
});
