import { describe, expect, it } from 'vitest';
import {
  aggregateEvents,
  isWithinWindow,
  WINDOW_DAYS,
} from '../../../src/fetchers/gh-events-stream/filter.js';

const NOW = Date.parse('2026-06-15T12:00:00Z');
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

function event(
  type: string,
  createdAtIso: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type, created_at: createdAtIso, ...extras };
}

describe('isWithinWindow', () => {
  it('keeps events created exactly at the now boundary', () => {
    const e = event('PullRequestEvent', new Date(NOW).toISOString());
    expect(isWithinWindow(e, NOW)).toBe(true);
  });

  it('keeps events created at the trailing edge of the window', () => {
    const edgeMs = NOW - WINDOW_MS;
    const e = event('IssuesEvent', new Date(edgeMs).toISOString());
    expect(isWithinWindow(e, NOW)).toBe(true);
  });

  it('drops events older than the window (8 days ago)', () => {
    const oldMs = NOW - 8 * 24 * 60 * 60 * 1000;
    const e = event('PushEvent', new Date(oldMs).toISOString());
    expect(isWithinWindow(e, NOW)).toBe(false);
  });

  it('drops events with a missing or unparseable created_at', () => {
    expect(isWithinWindow({ type: 'PushEvent' }, NOW)).toBe(false);
    expect(
      isWithinWindow({ type: 'PushEvent', created_at: 'not-a-date' }, NOW),
    ).toBe(false);
  });

  it('drops non-object inputs', () => {
    expect(isWithinWindow(null, NOW)).toBe(false);
    expect(isWithinWindow(undefined, NOW)).toBe(false);
    expect(isWithinWindow(42, NOW)).toBe(false);
    expect(isWithinWindow('PullRequestEvent', NOW)).toBe(false);
  });
});

describe('aggregateEvents', () => {
  it('returns the zero record for non-array input', () => {
    expect(aggregateEvents(null, NOW)).toEqual({
      events7d: 0,
      byType: { pr: 0, issues: 0, push: 0, release: 0 },
    });
    expect(aggregateEvents({}, NOW)).toEqual({
      events7d: 0,
      byType: { pr: 0, issues: 0, push: 0, release: 0 },
    });
    expect(aggregateEvents('whatever', NOW)).toEqual({
      events7d: 0,
      byType: { pr: 0, issues: 0, push: 0, release: 0 },
    });
  });

  it('drops events older than 7d AND non-stream types', () => {
    // Mix:
    //   - 2 PR within window  → kept
    //   - 1 PR 9 days old      → dropped (old)
    //   - 1 WatchEvent today   → dropped (Watch is captured by ghStars)
    //   - 1 ForkEvent today    → dropped (Fork not in STREAM_EVENT_TYPES)
    //   - 1 ReleaseEvent today → kept
    //   - 1 PushEvent today    → kept
    //   - 1 IssuesEvent today  → kept
    const isoNow = new Date(NOW).toISOString();
    const isoOld = new Date(NOW - 9 * 24 * 60 * 60 * 1000).toISOString();
    const events = [
      event('PullRequestEvent', isoNow),
      event('PullRequestEvent', isoNow),
      event('PullRequestEvent', isoOld),
      event('WatchEvent', isoNow),
      event('ForkEvent', isoNow),
      event('ReleaseEvent', isoNow),
      event('PushEvent', isoNow),
      event('IssuesEvent', isoNow),
    ];
    const out = aggregateEvents(events, NOW);
    expect(out.events7d).toBe(5); // 2 PR + 1 release + 1 push + 1 issues
    expect(out.byType).toEqual({ pr: 2, issues: 1, push: 1, release: 1 });
  });

  it('handles only-old-events as zero across the board', () => {
    const isoOld = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    const events = [
      event('PullRequestEvent', isoOld),
      event('IssuesEvent', isoOld),
      event('PushEvent', isoOld),
      event('ReleaseEvent', isoOld),
    ];
    expect(aggregateEvents(events, NOW)).toEqual({
      events7d: 0,
      byType: { pr: 0, issues: 0, push: 0, release: 0 },
    });
  });

  it('byType counts sum to events7d (invariant)', () => {
    const isoNow = new Date(NOW).toISOString();
    const events = Array.from({ length: 20 }, (_, i) =>
      event(
        ['PullRequestEvent', 'IssuesEvent', 'PushEvent', 'ReleaseEvent'][i % 4]!,
        isoNow,
      ),
    );
    const out = aggregateEvents(events, NOW);
    const sum =
      out.byType.pr + out.byType.issues + out.byType.push + out.byType.release;
    expect(sum).toBe(out.events7d);
    expect(out.events7d).toBe(20);
  });

  it('ignores entries with malformed event objects', () => {
    const isoNow = new Date(NOW).toISOString();
    const events = [
      event('PullRequestEvent', isoNow),
      null,
      undefined,
      'PushEvent',
      { type: 'PushEvent' /* missing created_at */ },
      event('PushEvent', 'garbage'),
      event('PushEvent', isoNow),
    ];
    const out = aggregateEvents(events, NOW);
    // 1 PR + 1 Push valid; everything else dropped
    expect(out.events7d).toBe(2);
    expect(out.byType).toEqual({ pr: 1, issues: 0, push: 1, release: 0 });
  });
});
