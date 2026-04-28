import { describe, expect, it } from 'vitest';
import { normalizePulse, type PulseServerEnvelope } from '../src/fetchers/pulsemcp/client.js';

describe('normalizePulse', () => {
  it('extracts visitorsEstimate from nested _meta.com.pulsemcp/server', () => {
    const envelope: PulseServerEnvelope = {
      server: {
        name: 'io.github.stripe/agent-toolkit',
        title: 'Stripe Agent Toolkit',
        description: 'Charge cards via Stripe API',
        repository: { url: 'https://github.com/stripe/agent-toolkit' },
        packages: [{ registryType: 'npm', identifier: '@stripe/agent-toolkit' }],
        remotes: [{ url: 'https://stripe.com/mcp', type: 'streamable-http' }],
      },
      _meta: {
        'com.pulsemcp/server': {
          visitorsEstimateLastFourWeeks: 42000,
          isOfficial: true,
        },
      },
    };
    const norm = normalizePulse(envelope);
    expect(norm).not.toBeNull();
    expect(norm!.source).toBe('pulsemcp');
    expect(norm!.name).toBe('Stripe Agent Toolkit');
    expect(norm!.qualified_name).toBe('io.github.stripe/agent-toolkit');
    expect(norm!.owner).toBe('stripe');
    expect(norm!.package_name).toBe('@stripe/agent-toolkit');
    expect(norm!.package_registry).toBe('npm');
    expect(norm!.github_url).toBe('https://github.com/stripe/agent-toolkit');
    expect(norm!.downloads_total).toBe(42000);
    expect(norm!.is_remote).toBe(true);
    // popularity_signal should land in (0, 1] for a 42k visitor count
    expect(norm!.popularity_signal).toBeGreaterThan(0);
    expect(norm!.popularity_signal).toBeLessThanOrEqual(1);
  });

  it('handles flat dotted _meta keys (com.pulsemcp/server.X)', () => {
    const envelope: PulseServerEnvelope = {
      server: {
        name: 'test-mcp',
        description: 'A test server',
      },
      _meta: {
        'com.pulsemcp/server.visitorsEstimateLastFourWeeks': 1500,
        'com.pulsemcp/server.isOfficial': false,
      },
    };
    const norm = normalizePulse(envelope);
    expect(norm!.downloads_total).toBe(1500);
  });

  it('returns 0 popularity_signal when no visitor count is available', () => {
    const envelope: PulseServerEnvelope = {
      server: { name: 'no-meta-mcp', description: 'No meta' },
    };
    const norm = normalizePulse(envelope);
    expect(norm!.downloads_total).toBeNull();
    expect(norm!.popularity_signal).toBe(0);
  });

  it('skips entries without a server name', () => {
    expect(normalizePulse({ server: {} })).toBeNull();
    expect(normalizePulse({})).toBeNull();
  });

  it('handles unwrapped (non-envelope) entries gracefully', () => {
    // Some registry implementations return the server directly without
    // wrapping in { server: ... }. Cover that fallback.
    const norm = normalizePulse({
      name: 'flat-shape-mcp',
      description: 'flat',
      repository: { url: 'https://github.com/foo/bar' },
    } as unknown as PulseServerEnvelope);
    expect(norm).not.toBeNull();
    expect(norm!.qualified_name).toBe('flat-shape-mcp');
    expect(norm!.github_url).toBe('https://github.com/foo/bar');
  });
});
