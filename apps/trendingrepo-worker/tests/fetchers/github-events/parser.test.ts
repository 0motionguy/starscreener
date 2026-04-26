import { describe, expect, it } from 'vitest';
import {
  isRelevantEventType,
  MAX_EVENTS_PER_REPO,
  normalizeEvent,
  normalizeEvents,
} from '../../../src/fetchers/github-events/parser.js';

const baseEvent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: '1',
  type: 'WatchEvent',
  created_at: '2026-04-26T12:00:00Z',
  actor: {
    login: 'octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
  },
  payload: { action: 'started' },
  ...overrides,
});

describe('normalizeEvent', () => {
  it('accepts a well-formed WatchEvent and copies all fields through', () => {
    const ev = normalizeEvent(baseEvent());
    expect(ev).not.toBeNull();
    expect(ev?.id).toBe('1');
    expect(ev?.type).toBe('WatchEvent');
    expect(ev?.actor).toEqual({
      login: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
    });
    expect(ev?.payload).toEqual({ action: 'started' });
    expect(ev?.createdAt).toBe('2026-04-26T12:00:00Z');
  });

  it.each([
    'ForkEvent',
    'IssuesEvent',
    'PullRequestEvent',
    'PushEvent',
    'ReleaseEvent',
  ] as const)('accepts %s as a relevant type', (type) => {
    const ev = normalizeEvent(baseEvent({ type }));
    expect(ev?.type).toBe(type);
  });

  it.each([
    'CommitCommentEvent',
    'CreateEvent',
    'DeleteEvent',
    'IssueCommentEvent',
    'GollumEvent',
    'MemberEvent',
    'PublicEvent',
    'PullRequestReviewEvent',
    'PullRequestReviewCommentEvent',
    'SponsorshipEvent',
  ])('rejects irrelevant event type %s', (type) => {
    expect(normalizeEvent(baseEvent({ type }))).toBeNull();
  });

  it('falls back to actor.display_login when login is missing', () => {
    const ev = normalizeEvent(
      baseEvent({
        actor: {
          display_login: 'fallback-login',
          avatar_url: 'https://x/avatar.png',
        },
      }),
    );
    expect(ev?.actor.login).toBe('fallback-login');
  });

  it('returns null actor.avatarUrl when missing', () => {
    const ev = normalizeEvent(
      baseEvent({
        actor: { login: 'octocat' },
      }),
    );
    expect(ev?.actor.avatarUrl).toBeNull();
  });

  it('coerces missing payload to an empty object so downstream keys are safe', () => {
    const ev = normalizeEvent(baseEvent({ payload: undefined }));
    expect(ev?.payload).toEqual({});
    const ev2 = normalizeEvent(baseEvent({ payload: 'not-an-object' }));
    expect(ev2?.payload).toEqual({});
    const ev3 = normalizeEvent(baseEvent({ payload: ['nope'] }));
    expect(ev3?.payload).toEqual({});
  });

  it('rejects events missing required fields', () => {
    expect(normalizeEvent(baseEvent({ id: undefined }))).toBeNull();
    expect(normalizeEvent(baseEvent({ id: '' }))).toBeNull();
    expect(normalizeEvent(baseEvent({ type: undefined }))).toBeNull();
    expect(normalizeEvent(baseEvent({ created_at: undefined }))).toBeNull();
    expect(normalizeEvent(baseEvent({ created_at: 'not-a-date' }))).toBeNull();
  });

  it('rejects garbage inputs without throwing', () => {
    expect(normalizeEvent(null)).toBeNull();
    expect(normalizeEvent(undefined)).toBeNull();
    expect(normalizeEvent('a string')).toBeNull();
    expect(normalizeEvent(42)).toBeNull();
    expect(normalizeEvent([])).toBeNull();
  });
});

describe('normalizeEvents', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeEvents(null)).toEqual([]);
    expect(normalizeEvents(undefined)).toEqual([]);
    expect(normalizeEvents('string')).toEqual([]);
    expect(normalizeEvents({ events: [] })).toEqual([]);
  });

  it('filters non-relevant types and normalizes the rest', () => {
    const result = normalizeEvents([
      baseEvent({ id: '1', type: 'WatchEvent' }),
      baseEvent({ id: '2', type: 'IssueCommentEvent' }),
      baseEvent({ id: '3', type: 'ForkEvent' }),
      baseEvent({ id: '4', type: 'CreateEvent' }),
    ]);
    expect(result.map((e) => e.id)).toEqual(['1', '3']);
  });

  it('sorts newest first by createdAt', () => {
    const result = normalizeEvents([
      baseEvent({ id: 'old', created_at: '2026-04-26T10:00:00Z' }),
      baseEvent({ id: 'new', created_at: '2026-04-26T14:00:00Z' }),
      baseEvent({ id: 'mid', created_at: '2026-04-26T12:00:00Z' }),
    ]);
    expect(result.map((e) => e.id)).toEqual(['new', 'mid', 'old']);
  });

  it('caps output at MAX_EVENTS_PER_REPO even if input is larger', () => {
    const huge = Array.from({ length: MAX_EVENTS_PER_REPO + 25 }, (_, i) =>
      baseEvent({
        id: String(i),
        type: 'WatchEvent',
        // Stagger timestamps so sort is deterministic.
        created_at: new Date(Date.parse('2026-04-26T00:00:00Z') + i * 1000).toISOString(),
      }),
    );
    const result = normalizeEvents(huge);
    expect(result.length).toBe(MAX_EVENTS_PER_REPO);
    // Newest (highest i) should be first after sort.
    expect(result[0]?.id).toBe(String(MAX_EVENTS_PER_REPO + 24));
  });

  it('skips malformed entries inside an otherwise-valid array', () => {
    const result = normalizeEvents([
      baseEvent({ id: 'good-1' }),
      null,
      'garbage',
      { id: 'no-type', created_at: '2026-04-26T12:00:00Z' },
      baseEvent({ id: 'good-2' }),
    ]);
    expect(result.map((e) => e.id).sort()).toEqual(['good-1', 'good-2']);
  });
});

describe('isRelevantEventType', () => {
  it('agrees with the normalize allow-list', () => {
    expect(isRelevantEventType('WatchEvent')).toBe(true);
    expect(isRelevantEventType('PushEvent')).toBe(true);
    expect(isRelevantEventType('IssueCommentEvent')).toBe(false);
    expect(isRelevantEventType('NotARealType')).toBe(false);
  });
});
