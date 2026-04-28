import { describe, it, expect } from 'vitest';
import {
  AGENT_REGISTRY,
  ALL_AGENT_IDS,
  AGENT_REGISTRY_VERSION,
  lookupAgent,
  iconUrl,
  brandColor,
  isOpenClawCompatible,
  categoriseAgents,
} from '../../../src/fetchers/skills-sh/agents.js';

describe('AGENT_REGISTRY', () => {
  it('is non-empty and version-tagged', () => {
    expect(ALL_AGENT_IDS.length).toBeGreaterThanOrEqual(40);
    expect(AGENT_REGISTRY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('every entry has a stable icon URL', () => {
    for (const id of ALL_AGENT_IDS) {
      expect(iconUrl(id)).toBe(`https://skills.sh/agents/${id}.svg`);
    }
  });

  it('OpenClaw is present and AGNT-flagged', () => {
    const oc = lookupAgent('openclaw');
    expect(oc).toBeTruthy();
    expect(oc?.vendor).toMatch(/AGNT|ICM Motion/);
    expect(oc?.category).toBe('terminal_cli');
    expect(oc?.official_url).toBe('https://open-claw.bot');
  });

  it('lookupAgent returns null for unknown slugs', () => {
    expect(lookupAgent('this-is-not-a-real-agent')).toBeNull();
  });

  it('brandColor returns null when not set', () => {
    // Adal is one of the agents we left null intentionally.
    expect(brandColor('adal')).toBeNull();
  });

  it('isOpenClawCompatible only fires on the openclaw slug', () => {
    expect(isOpenClawCompatible(['claude-code', 'cursor'])).toBe(false);
    expect(isOpenClawCompatible(['openclaw', 'cursor'])).toBe(true);
    expect(isOpenClawCompatible([])).toBe(false);
  });

  it('categoriseAgents buckets correctly + flags unknowns', () => {
    const groups = categoriseAgents([
      'claude-code',
      'cursor',
      'openhands',
      'replit',
      'universal',
      'pi',
      'made-up-agent',
    ]);
    expect(groups.terminal_cli).toContain('claude-code');
    expect(groups.ide).toContain('cursor');
    expect(groups.agent_framework).toContain('openhands');
    expect(groups.platform).toContain('replit');
    expect(groups.meta).toContain('universal');
    expect(groups.chat).toContain('pi');
    expect(groups.unknown).toEqual(['made-up-agent']);
  });
});
