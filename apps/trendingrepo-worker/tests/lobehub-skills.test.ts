import { describe, expect, it } from 'vitest';
import { parseLobehubHtml } from '../src/fetchers/lobehub-skills/index.js';

describe('LobeHub native SSR parser', () => {
  it('extracts unique skill paths and nearby install counts', () => {
    const html = [
      '<a href="/skills/acme/alpha-skill">Alpha</a>',
      '{"installCount":1234}',
      '<a href="/skills/acme/beta-skill">Beta</a>',
      '{"installCount":42}',
      '<a href="/skills/acme/alpha-skill">duplicate</a>',
    ].join('');

    expect(parseLobehubHtml(html)).toEqual([
      {
        source_id: 'acme/alpha-skill',
        title: 'alpha skill',
        url: 'https://lobehub.com/skills/acme/alpha-skill',
        installs: 1234,
        stars: null,
      },
      {
        source_id: 'acme/beta-skill',
        title: 'beta skill',
        url: 'https://lobehub.com/skills/acme/beta-skill',
        installs: 42,
        stars: null,
      },
    ]);
  });
});
