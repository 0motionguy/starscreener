// arXiv fetcher types.

export const ARXIV_CATEGORIES = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.MA'] as const;
export type ArxivCategory = (typeof ARXIV_CATEGORIES)[number];

export interface ArxivPaper {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  firstAuthor: string | null;
  affiliations: string[];
  primaryCategory: string;
  categories: string[];
  publishedAt: string;
  updatedAt: string;
  absUrl: string;
  pdfUrl: string;
  doi: string | null;
  journalRef: string | null;
  comment: string | null;
  licenseUrl: string | null;
  rawXml: string;
}

export interface ArxivFetchInput {
  category: ArxivCategory;
  sinceIso: string;
  pageSize: number;
  maxPages: number;
}

export interface ArxivFetchOutput {
  category: ArxivCategory;
  pagesFetched: number;
  totalResults: number;
  papers: ArxivPaper[];
  truncated: boolean;
}
