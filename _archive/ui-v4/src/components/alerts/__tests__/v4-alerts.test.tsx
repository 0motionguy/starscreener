// Unit tests for V4 alert primitives: AlertBadge, AlertToggle,
// AlertTriggerCard, AlertEventRow, AlertInbox.

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlertBadge } from "@/components/alerts/AlertBadge";
import { AlertToggle } from "@/components/alerts/AlertToggle";
import { AlertTriggerCard } from "@/components/alerts/AlertTriggerCard";
import { AlertEventRow } from "@/components/alerts/AlertEventRow";
import { AlertInbox } from "@/components/alerts/AlertInbox";

import type { AlertEvent, AlertRule } from "@/lib/pipeline/types";

afterEach(() => {
  cleanup();
});

const RULE: AlertRule = {
  id: "rule-1",
  userId: "local",
  repoId: "anthropic/claude-code",
  categoryId: null,
  trigger: "star_spike",
  threshold: 100,
  cooldownMinutes: 60,
  enabled: true,
  createdAt: "2026-04-01T00:00:00Z",
  lastFiredAt: null,
};

const EVENT: AlertEvent = {
  id: "evt-1",
  ruleId: "rule-1",
  repoId: "anthropic/claude-code",
  userId: "local",
  trigger: "star_spike",
  title: "+824 stars in 24h",
  body: "anthropic/claude-code crossed your 500-star threshold.",
  url: "/repo/anthropic/claude-code",
  firedAt: "2026-04-30T06:00:00Z",
  readAt: null,
  conditionValue: 824,
  threshold: 500,
};

// ---------------------------------------------------------------------------
// AlertBadge
// ---------------------------------------------------------------------------

describe("AlertBadge", () => {
  it("renders count when > 0", () => {
    const { container } = render(<AlertBadge count={3} />);
    const b = container.querySelector(".v4-alert-badge");
    expect(b?.textContent).toBe("3");
    expect(b?.className).toContain("v4-alert-badge--amber");
  });

  it("returns null when count is 0", () => {
    const { container } = render(<AlertBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("clamps display to 99+", () => {
    const { container } = render(<AlertBadge count={156} />);
    expect(container.querySelector(".v4-alert-badge")?.textContent).toBe("99+");
  });

  it("supports money + red tones and compact size", () => {
    const { container } = render(
      <>
        <AlertBadge count={1} tone="money" />
        <AlertBadge count={1} tone="red" />
        <AlertBadge count={1} compact />
      </>,
    );
    const els = container.querySelectorAll(".v4-alert-badge");
    expect(els[0].className).toContain("--money");
    expect(els[1].className).toContain("--red");
    expect(els[2].className).toContain("--compact");
  });

  it("emits an aria-label with singular/plural agreement", () => {
    const { container, rerender } = render(<AlertBadge count={1} />);
    expect(
      container.querySelector(".v4-alert-badge")?.getAttribute("aria-label"),
    ).toBe("1 unread alert");
    rerender(<AlertBadge count={2} />);
    expect(
      container.querySelector(".v4-alert-badge")?.getAttribute("aria-label"),
    ).toBe("2 unread alerts");
  });
});

// ---------------------------------------------------------------------------
// AlertToggle
// ---------------------------------------------------------------------------

describe("AlertToggle", () => {
  it("renders OFF state with default label", () => {
    const { container } = render(
      <AlertToggle enabled={false} onToggle={async () => false} />,
    );
    const btn = container.querySelector("button.v4-alert-toggle");
    expect(btn?.textContent).toContain("ALERT ME");
    expect(btn?.className).not.toContain("v4-alert-toggle--on");
    expect(btn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders ON state with default label", () => {
    const { container } = render(
      <AlertToggle enabled={true} onToggle={async () => true} />,
    );
    const btn = container.querySelector("button.v4-alert-toggle");
    expect(btn?.textContent).toContain("ALERTING");
    expect(btn?.className).toContain("v4-alert-toggle--on");
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("optimistically flips state then commits server response", async () => {
    const onToggle = vi.fn(async (next: boolean) => next);
    const { container } = render(
      <AlertToggle enabled={false} onToggle={onToggle} />,
    );
    fireEvent.click(container.querySelector("button.v4-alert-toggle")!);
    // Optimistic: should flip to ON immediately.
    expect(
      container.querySelector("button.v4-alert-toggle")?.className,
    ).toContain("v4-alert-toggle--on");
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(true));
  });

  it("reverts on server failure", async () => {
    const onToggle = vi.fn(async () => {
      throw new Error("boom");
    });
    const { container } = render(
      <AlertToggle enabled={false} onToggle={onToggle} />,
    );
    fireEvent.click(container.querySelector("button.v4-alert-toggle")!);
    await waitFor(() => {
      const btn = container.querySelector("button.v4-alert-toggle");
      expect(btn?.className).not.toContain("v4-alert-toggle--on");
      expect(btn?.getAttribute("title")).toBe("boom");
    });
  });

  it("supports custom label override", () => {
    const { container } = render(
      <AlertToggle
        enabled={false}
        onToggle={async () => false}
        label={{ off: "WATCH", on: "WATCHING" }}
      />,
    );
    expect(
      container.querySelector("button.v4-alert-toggle")?.textContent,
    ).toBe("WATCH");
  });
});

// ---------------------------------------------------------------------------
// AlertTriggerCard
// ---------------------------------------------------------------------------

describe("AlertTriggerCard", () => {
  it("renders the trigger label, repo, and threshold", () => {
    const { container, getByText } = render(
      <AlertTriggerCard rule={RULE} repoLabel="anthropic/claude-code" />,
    );
    expect(getByText("STAR SPIKE")).not.toBeNull();
    expect(container.querySelector(".v4-trigger-card__target")?.textContent).toContain(
      "anthropic/claude-code",
    );
    expect(container.querySelector(".v4-trigger-card__target")?.textContent).toContain(
      "100",
    );
  });

  it("calls onToggle with new state when toggle is clicked", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <AlertTriggerCard rule={RULE} onToggle={onToggle} />,
    );
    fireEvent.click(container.querySelector(".v4-trigger-card__toggle")!);
    expect(onToggle).toHaveBeenCalledWith(RULE, false);
  });

  it("calls onDelete when REMOVE is clicked", () => {
    const onDelete = vi.fn();
    const { container } = render(
      <AlertTriggerCard rule={RULE} onDelete={onDelete} />,
    );
    fireEvent.click(container.querySelector(".v4-trigger-card__delete")!);
    expect(onDelete).toHaveBeenCalledWith(RULE);
  });

  it("dims the card when rule.enabled is false", () => {
    const { container } = render(
      <AlertTriggerCard rule={{ ...RULE, enabled: false }} />,
    );
    expect(container.querySelector(".v4-trigger-card")?.className).toContain(
      "--off",
    );
  });
});

// ---------------------------------------------------------------------------
// AlertEventRow
// ---------------------------------------------------------------------------

describe("AlertEventRow", () => {
  it("renders unread state with left rail when readAt is null", () => {
    const { container } = render(<AlertEventRow event={EVENT} ago="4h ago" />);
    expect(container.querySelector(".v4-alert-event")?.className).toContain(
      "v4-alert-event--unread",
    );
  });

  it("renders read state when readAt is populated", () => {
    const { container } = render(
      <AlertEventRow event={{ ...EVENT, readAt: "2026-04-30T08:00:00Z" }} ago="2h" />,
    );
    expect(container.querySelector(".v4-alert-event")?.className).toContain(
      "v4-alert-event--read",
    );
  });

  it("renders OPEN link only when event.url is set", () => {
    const { container, rerender } = render(
      <AlertEventRow event={EVENT} ago="x" />,
    );
    expect(container.querySelector(".v4-alert-event__open")).not.toBeNull();
    rerender(<AlertEventRow event={{ ...EVENT, url: "" }} ago="x" />);
    expect(container.querySelector(".v4-alert-event__open")).toBeNull();
  });

  it("calls onMarkRead when MARK READ button is clicked (unread events only)", () => {
    const onMarkRead = vi.fn();
    const { container } = render(
      <AlertEventRow event={EVENT} ago="x" onMarkRead={onMarkRead} />,
    );
    fireEvent.click(container.querySelector(".v4-alert-event__mark")!);
    expect(onMarkRead).toHaveBeenCalledWith(EVENT);
  });

  it("hides MARK READ button on already-read events", () => {
    const onMarkRead = vi.fn();
    const { container } = render(
      <AlertEventRow
        event={{ ...EVENT, readAt: "now" }}
        ago="x"
        onMarkRead={onMarkRead}
      />,
    );
    expect(container.querySelector(".v4-alert-event__mark")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AlertInbox
// ---------------------------------------------------------------------------

describe("AlertInbox", () => {
  it("renders empty state when events is empty", () => {
    const { container } = render(<AlertInbox events={[]} />);
    expect(container.querySelector(".v4-alert-inbox--empty")).not.toBeNull();
  });

  it("buckets events by recency: today / week / older", () => {
    const now = Date.UTC(2026, 3, 30, 12, 0, 0);
    const events: AlertEvent[] = [
      { ...EVENT, id: "today", firedAt: new Date(now - 2 * 3600_000).toISOString() },
      { ...EVENT, id: "week", firedAt: new Date(now - 3 * 86_400_000).toISOString() },
      { ...EVENT, id: "older", firedAt: new Date(now - 30 * 86_400_000).toISOString() },
    ];
    const { container } = render(<AlertInbox events={events} nowMs={now} />);
    const groups = container.querySelectorAll(".v4-alert-inbox__group");
    expect(groups).toHaveLength(3);
    // First group is "Today"
    expect(groups[0].querySelector(".v4-alert-inbox__head-title")?.textContent).toBe(
      "Today",
    );
    expect(groups[1].querySelector(".v4-alert-inbox__head-title")?.textContent).toBe(
      "This week",
    );
    expect(groups[2].querySelector(".v4-alert-inbox__head-title")?.textContent).toBe(
      "Older",
    );
  });

  it("formats event ages via the supplied formatAge", () => {
    const now = Date.UTC(2026, 3, 30, 12, 0, 0);
    const events: AlertEvent[] = [
      { ...EVENT, id: "x", firedAt: new Date(now - 2 * 3600_000).toISOString() },
    ];
    const { container } = render(
      <AlertInbox
        events={events}
        nowMs={now}
        formatAge={() => "2H"}
      />,
    );
    expect(container.querySelector(".v4-alert-event__ago")?.textContent).toBe(
      "2H",
    );
  });

  it("forwards onMarkRead to event rows", () => {
    const onMarkRead = vi.fn();
    const events: AlertEvent[] = [
      { ...EVENT, firedAt: new Date(Date.now() - 60_000).toISOString() },
    ];
    const { container } = render(
      <AlertInbox events={events} onMarkRead={onMarkRead} />,
    );
    fireEvent.click(container.querySelector(".v4-alert-event__mark")!);
    expect(onMarkRead).toHaveBeenCalledTimes(1);
  });

  it("skips empty groups in the rendered output", () => {
    const now = Date.UTC(2026, 3, 30, 12, 0, 0);
    const events: AlertEvent[] = [
      { ...EVENT, firedAt: new Date(now - 60_000).toISOString() },
    ];
    const { container } = render(<AlertInbox events={events} nowMs={now} />);
    expect(container.querySelectorAll(".v4-alert-inbox__group")).toHaveLength(1);
  });
});
