// Unified RSS 2.0 + Atom 1.0 parser. Lab blogs use both dialects so the
// parser auto-detects per feed.

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { canonicalUrl } from './canonical-url.js';

export interface BlogPost {
  url: string;
  title: string;
  publishedAt: string | null;
  summary: string;
  author: string | null;
}

export interface RssParseResult {
  format: 'rss' | 'atom' | 'unknown';
  posts: BlogPost[];
  errors: Array<{ index: number; reason: string }>;
}

const SUMMARY_MAX = 500;

export function parseFeed(xml: string): RssParseResult {
  if (!xml || typeof xml !== 'string') {
    return { format: 'unknown', posts: [], errors: [{ index: -1, reason: 'empty-input' }] };
  }
  let $: CheerioAPI;
  try {
    $ = cheerio.load(xml, { xmlMode: true });
  } catch (err) {
    return { format: 'unknown', posts: [], errors: [{ index: -1, reason: `xml-load-failed: ${(err as Error).message}` }] };
  }

  if ($('rss').length > 0 || $('channel item').length > 0) return parseRss($);
  if ($('feed entry').length > 0 || $('feed').length > 0) return parseAtom($);
  return { format: 'unknown', posts: [], errors: [{ index: -1, reason: 'no-rss-or-atom-root' }] };
}

function parseRss($: CheerioAPI): RssParseResult {
  const posts: BlogPost[] = [];
  const errors: RssParseResult['errors'] = [];
  $('channel > item, rss item').each((index, el) => {
    try {
      const $i = $(el);
      const linkRaw = ($i.children('link').first().text() || $i.children('guid').first().text()).trim();
      const canonical = canonicalUrl(linkRaw);
      if (!canonical) {
        errors.push({ index, reason: 'missing-or-invalid-link' });
        return;
      }
      const title = stripHtml($i.children('title').first().text());
      if (!title) {
        errors.push({ index, reason: 'missing-title' });
        return;
      }
      const dateRaw = ($i.children('pubDate').first().text() ||
        $i.children('dc\\:date').first().text() ||
        $i.children('date').first().text()).trim();
      const summaryRaw = ($i.children('description').first().text() ||
        $i.children('content\\:encoded').first().text());
      const author = ($i.children('author').first().text() ||
        $i.children('dc\\:creator').first().text() ||
        '').trim() || null;
      posts.push({
        url: canonical, title,
        publishedAt: parseDate(dateRaw),
        summary: stripHtml(summaryRaw).slice(0, SUMMARY_MAX),
        author,
      });
    } catch (err) {
      errors.push({ index, reason: (err as Error).message });
    }
  });
  return { format: 'rss', posts, errors };
}

function parseAtom($: CheerioAPI): RssParseResult {
  const posts: BlogPost[] = [];
  const errors: RssParseResult['errors'] = [];
  $('feed > entry, entry').each((index, el) => {
    try {
      const $e = $(el);
      const linkRaw = $e.children('link').filter((_, l) => {
        const rel = $(l).attr('rel');
        return !rel || rel === 'alternate';
      }).first().attr('href') ?? $e.children('id').first().text().trim();
      const canonical = canonicalUrl(linkRaw);
      if (!canonical) {
        errors.push({ index, reason: 'missing-or-invalid-link' });
        return;
      }
      const title = stripHtml($e.children('title').first().text());
      if (!title) {
        errors.push({ index, reason: 'missing-title' });
        return;
      }
      const dateRaw = ($e.children('updated').first().text() ||
        $e.children('published').first().text()).trim();
      const summaryRaw = ($e.children('summary').first().text() ||
        $e.children('content').first().text());
      const author = ($e.children('author').first().children('name').first().text() || '').trim() || null;
      posts.push({
        url: canonical, title,
        publishedAt: parseDate(dateRaw),
        summary: stripHtml(summaryRaw).slice(0, SUMMARY_MAX),
        author,
      });
    } catch (err) {
      errors.push({ index, reason: (err as Error).message });
    }
  });
  return { format: 'atom', posts, errors };
}

function stripHtml(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw.trim());
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return null;
}
