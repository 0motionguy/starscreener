import { afterEach, describe, expect, it } from 'vitest';

import {
  getRedditUserAgent,
  resetRedditFetchRuntime,
} from '../src/lib/sources/reddit.js';

const previousEnv = {
  REDDIT_USER_AGENT: process.env.REDDIT_USER_AGENT,
  REDDIT_USER_AGENTS: process.env.REDDIT_USER_AGENTS,
};

afterEach(() => {
  if (previousEnv.REDDIT_USER_AGENT === undefined) delete process.env.REDDIT_USER_AGENT;
  else process.env.REDDIT_USER_AGENT = previousEnv.REDDIT_USER_AGENT;
  if (previousEnv.REDDIT_USER_AGENTS === undefined) delete process.env.REDDIT_USER_AGENTS;
  else process.env.REDDIT_USER_AGENTS = previousEnv.REDDIT_USER_AGENTS;
  resetRedditFetchRuntime();
});

describe('worker reddit user agents', () => {
  it('rotates REDDIT_USER_AGENTS when no single-UA override is set', () => {
    delete process.env.REDDIT_USER_AGENT;
    process.env.REDDIT_USER_AGENTS = 'WorkerUA/1, WorkerUA/2\nWorkerUA/3';
    resetRedditFetchRuntime();

    expect(getRedditUserAgent()).toBe('WorkerUA/1');
    expect(getRedditUserAgent()).toBe('WorkerUA/2');
    expect(getRedditUserAgent()).toBe('WorkerUA/3');
    expect(getRedditUserAgent()).toBe('WorkerUA/1');
  });

  it('keeps REDDIT_USER_AGENT as exact stable override over pool', () => {
    process.env.REDDIT_USER_AGENT = 'WorkerExact/1';
    process.env.REDDIT_USER_AGENTS = 'WorkerUA/1,WorkerUA/2';
    resetRedditFetchRuntime();

    expect(getRedditUserAgent()).toBe('WorkerExact/1');
    expect(getRedditUserAgent()).toBe('WorkerExact/1');
  });
});
