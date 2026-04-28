import { describe, expect, it } from 'vitest';
import { resolveLogo } from '../src/lib/mcp/logo-resolver.js';

describe('resolveLogo', () => {
  it('returns a simple-icons CDN URL for vendors with a slug', () => {
    const logo = resolveLogo('stripe');
    expect(logo).not.toBeNull();
    expect(logo!.url).toBe('https://cdn.simpleicons.org/stripe/635BFF');
    expect(logo!.simple_icons_slug).toBe('stripe');
    expect(logo!.brand_color).toBe('635BFF');
    expect(logo!.source).toBe('simple-icons');
  });

  it('builds a well-formed URL for googledrive', () => {
    const logo = resolveLogo('google-drive');
    expect(logo!.url).toBe('https://cdn.simpleicons.org/googledrive/4285F4');
  });

  it('falls back to fallback_logo_url when no simple_icons_slug', () => {
    const logo = resolveLogo('chroma');
    expect(logo).not.toBeNull();
    expect(logo!.source).toBe('fallback');
    expect(logo!.url).toContain('trychroma.com');
  });

  it('returns null for unknown vendor', () => {
    expect(resolveLogo('definitely-not-a-vendor')).toBeNull();
  });

  it('returns null when slug is null', () => {
    expect(resolveLogo(null)).toBeNull();
  });

  it.each([
    ['notion', 'notion', '000000'],
    ['slack', 'slack', '4A154B'],
    ['github', 'github', '181717'],
    ['supabase', 'supabase', '3FCF8E'],
    ['linear', 'linear', '5E6AD2'],
    ['discord', 'discord', '5865F2'],
    ['huggingface', 'huggingface', 'FFD21E'],
    ['anthropic', 'anthropic', 'D97706'],
    ['openai', 'openai', '412991'],
    ['figma', 'figma', 'F24E1E'],
  ])('produces a stable simple-icons URL for %s', (slug, expectedIcon, expectedColor) => {
    const logo = resolveLogo(slug);
    expect(logo!.url).toBe(`https://cdn.simpleicons.org/${expectedIcon}/${expectedColor}`);
  });
});
