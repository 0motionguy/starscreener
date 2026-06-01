import { describe, expect, it } from 'vitest';

import { summarizeGraphqlErrors } from '../index.js';

describe('repo-metadata GraphQL error classification', () => {
  it('classifies repository NOT_FOUND errors as expected stale-roster misses', () => {
    const summary = summarizeGraphqlErrors([
      {
        type: 'NOT_FOUND',
        path: ['r0'],
        message: "Could not resolve to a Repository with the name 'BAAI/bge-m3'.",
      },
      {
        type: 'NOT_FOUND',
        path: ['r1'],
        message:
          "Could not resolve to a Repository with the name 'deleted/repo'.",
      },
    ]);

    expect(summary.notFoundCount).toBe(2);
    expect(summary.unexpectedCount).toBe(0);
  });

  it('keeps non-NOT_FOUND GraphQL errors warning-worthy', () => {
    const summary = summarizeGraphqlErrors([
      {
        type: 'RATE_LIMITED',
        message: 'API rate limit exceeded',
      },
    ]);

    expect(summary.notFoundCount).toBe(0);
    expect(summary.unexpectedCount).toBe(1);
    expect(summary.unexpectedSamples).toHaveLength(1);
  });
});
