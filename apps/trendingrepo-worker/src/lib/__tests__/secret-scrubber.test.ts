// Unit tests for the secret scrubber.
//
// Covers each of the 9 patterns declared in `../secret-scrubber.ts` plus
// the multi-secret, multi-line, idempotency, and no-op edge cases. Test
// secrets are obvious-looking placeholders (`EXAMPLEKEY…`) so a future
// gitleaks/GH-Secret-Scanning run on this file does not raise a false alert.

import { describe, expect, it } from 'vitest';
import { listPatterns, redactSecrets, scrub } from '../secret-scrubber.js';

describe('redactSecrets — per-pattern coverage', () => {
  it('strips AWS AKIA access keys', () => {
    const { clean, hits } = redactSecrets('creds AKIAEXAMPLEKEY12345X end');
    expect(clean).toBe('creds [REDACTED:aws-akia] end');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^aws-akia:AKIA…\w{4}$/);
  });

  it('strips AWS ASIA STS keys (the original 2026-05 leak)', () => {
    const { clean, hits } = redactSecrets('token=ASIAEXAMPLEKEY12345X ok');
    expect(clean).toBe('token=[REDACTED:aws-asia] ok');
    expect(hits[0]).toMatch(/^aws-asia:ASIA…/);
  });

  it('strips Stripe webhook signing secrets', () => {
    const { clean, hits } = redactSecrets(
      'STRIPE_WEBHOOK_SECRET=whsec_abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(clean).toBe('STRIPE_WEBHOOK_SECRET=[REDACTED:stripe-whsec]');
    expect(hits[0]).toMatch(/^stripe-whsec:whse…/);
  });

  it('strips Stripe live secret keys', () => {
    const { clean, hits } = redactSecrets(
      'curl -u sk_live_abcdefghij1234567890XYZ:',
    );
    expect(clean).toContain('[REDACTED:stripe-sk-live]');
    expect(hits[0]).toMatch(/^stripe-sk-live:sk_l…/);
  });

  it('strips GitHub classic PATs (ghp_)', () => {
    const { clean, hits } = redactSecrets(
      'token=ghp_abcdefghijklmnopqrstuvwxyzABCDEF0123',
    );
    expect(clean).toBe('token=[REDACTED:gh-pat]');
    expect(hits[0]).toMatch(/^gh-pat:ghp_…/);
  });

  it('strips GitHub server tokens (ghs_)', () => {
    const { clean, hits } = redactSecrets(
      'authorization: token ghs_abcdefghijklmnopqrstuvwxyzABCDEF0123',
    );
    expect(clean).toContain('[REDACTED:gh-server]');
    expect(hits[0]).toMatch(/^gh-server:ghs_…/);
  });

  it('strips GitHub fine-grained PATs (github_pat_)', () => {
    const finePat =
      'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz1234567890_ABCD';
    const { clean, hits } = redactSecrets(`auth=${finePat}`);
    expect(clean).toBe('auth=[REDACTED:gh-fine]');
    expect(hits[0]).toMatch(/^gh-fine:gith…/);
  });

  it('strips Google API keys (AIza)', () => {
    // 'AIza' + 35 trailing chars [A-Za-z0-9_-]{35}.
    const key = 'AIzaSyExampleKeyAbcdefghijklmnopqrstuvw';
    const { clean, hits } = redactSecrets(`GOOGLE_API_KEY=${key} ok`);
    expect(clean).toBe('GOOGLE_API_KEY=[REDACTED:google-api] ok');
    expect(hits[0]).toMatch(/^google-api:AIza…/);
  });

  it('strips Sentry tokens (sntrys_)', () => {
    const sentry =
      'sntrys_eyJpYXQiOjE3MDAwMDAwMDAuMCwidXJsIjoiaHR0cHM6Ly9zZW50cnkuaW8iLCJyZWdpb25fdXJsIjoiaHR0cHM6Ly91cy5zZW50cnkuaW8iLCJvcmciOiJleGFtcGxlIn0=_exampleSignature';
    const { clean, hits } = redactSecrets(`SENTRY_AUTH_TOKEN=${sentry}`);
    expect(clean).toContain('[REDACTED:sentry-token]');
    expect(hits[0]).toMatch(/^sentry-token:sntr…/);
  });
});

describe('redactSecrets — edge cases', () => {
  it('returns empty hits when input has no secrets', () => {
    const { clean, hits } = redactSecrets('just some plain text');
    expect(clean).toBe('just some plain text');
    expect(hits).toEqual([]);
  });

  it('handles empty string', () => {
    const { clean, hits } = redactSecrets('');
    expect(clean).toBe('');
    expect(hits).toEqual([]);
  });

  it('handles multiple secrets in one input', () => {
    const input =
      'AWS=AKIAEXAMPLEKEY12345X and STRIPE=whsec_abcdefghijklmnopqrstuvwxyz123456';
    const { clean, hits } = redactSecrets(input);
    expect(clean).toBe(
      'AWS=[REDACTED:aws-akia] and STRIPE=[REDACTED:stripe-whsec]',
    );
    expect(hits).toHaveLength(2);
  });

  it('is idempotent — re-scrubbing already-redacted text is a no-op', () => {
    const once = redactSecrets('AKIAEXAMPLEKEY12345X').clean;
    const twice = redactSecrets(once).clean;
    expect(twice).toBe(once);
    expect(twice).toBe('[REDACTED:aws-akia]');
  });

  it('scrub() returns just the cleaned string', () => {
    expect(scrub('plain')).toBe('plain');
    expect(scrub('AKIAEXAMPLEKEY12345X')).toBe('[REDACTED:aws-akia]');
  });

  it('exposes 9 patterns via listPatterns()', () => {
    const names = listPatterns().map((p) => p.name);
    expect(names).toHaveLength(9);
    expect(names).toEqual(
      expect.arrayContaining([
        'aws-akia',
        'aws-asia',
        'stripe-whsec',
        'stripe-sk-live',
        'gh-pat',
        'gh-server',
        'gh-fine',
        'google-api',
        'sentry-token',
      ]),
    );
  });
});
