import type { BlogPost } from '../../lib/feeds/rss-parser.js';

export interface NormalizedPost {
  url: string;
  labId: string;
  title: string;
  summary: string;
  publishedAt: string | null;
  author: string | null;
  arxivIds: string[];
}

export interface LabFetchResult {
  labId: string;
  feedFormat: 'rss' | 'atom' | 'unknown';
  posts: NormalizedPost[];
  errors: Array<{ stage: string; message: string }>;
}

export interface RssFetchInput {
  labId: string;
  feedUrl: string;
  sinceIso: string;
}

export type { BlogPost };
