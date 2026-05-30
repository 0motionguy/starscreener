// Unit tests for drop-twitter-drain's payload parser. The runtime logic
// (camofox tab management + applyLedger) is hard to mock at the unit layer;
// integration coverage lives in the deploy-time smoke test (drop a real repo,
// watch SCARD grow within 2 min). What we CAN test cheaply here is the
// defensive shape of the queue payload — every garbage form must yield
// `null` so a malformed entry can't crash the tick.

import { describe, it, expect } from 'vitest';

import { parsePayload } from '../index.js';

describe('parsePayload', () => {
  it('returns the payload (with default attempts=0) for a valid entry', () => {
    const raw = JSON.stringify({
      fullName: 'vercel/next.js',
      enqueuedAt: '2026-05-30T07:00:00.000Z',
      source: 'web:repo-submissions',
    });
    expect(parsePayload(raw)).toEqual({
      fullName: 'vercel/next.js',
      enqueuedAt: '2026-05-30T07:00:00.000Z',
      source: 'web:repo-submissions',
      attempts: 0,
    });
  });

  it('preserves an existing positive attempts count', () => {
    const raw = JSON.stringify({
      fullName: 'a/b',
      enqueuedAt: '2026-05-30T07:00:00.000Z',
      attempts: 2,
      lastError: 'camofox down',
    });
    const parsed = parsePayload(raw);
    expect(parsed?.attempts).toBe(2);
    expect(parsed?.lastError).toBe('camofox down');
  });

  it('floors fractional attempts (defensive)', () => {
    const raw = JSON.stringify({ fullName: 'a/b', enqueuedAt: 't', attempts: 1.8 });
    expect(parsePayload(raw)?.attempts).toBe(1);
  });

  it('clamps negative / zero / NaN attempts to 0', () => {
    expect(parsePayload(JSON.stringify({ fullName: 'a/b', enqueuedAt: 't', attempts: -1 }))?.attempts).toBe(0);
    expect(parsePayload(JSON.stringify({ fullName: 'a/b', enqueuedAt: 't', attempts: 0 }))?.attempts).toBe(0);
    expect(parsePayload(JSON.stringify({ fullName: 'a/b', enqueuedAt: 't', attempts: 'not-a-number' }))?.attempts).toBe(0);
  });

  it('returns null for null / empty input', () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parsePayload('{ not valid }')).toBeNull();
    expect(parsePayload('[]')).toBeNull(); // wrong shape — fullName missing
  });

  it('returns null when fullName is missing / wrong type / has no slash', () => {
    expect(parsePayload(JSON.stringify({ enqueuedAt: 't' }))).toBeNull();
    expect(parsePayload(JSON.stringify({ fullName: '', enqueuedAt: 't' }))).toBeNull();
    expect(parsePayload(JSON.stringify({ fullName: 123, enqueuedAt: 't' }))).toBeNull();
    expect(parsePayload(JSON.stringify({ fullName: 'no-slash', enqueuedAt: 't' }))).toBeNull();
  });
});
