// dev.to loader — trending side.
//
// Reads data/devto-trending.json (top-100 articles by velocity score,
// last 7d). Split from src/lib/devto.ts so client components that only
// need per-repo mention badges don't pull this larger trending JSON
// into their bundle. The future /news dev.to tab imports from here.

import devtoTrendingData from "../../data/devto-trending.json";
import type { DevtoArticle, DevtoBodyFetchMode } from "./devto";

export interface DevtoTrendingFile {
  fetchedAt: string;
  windowDays: number;
  scannedArticles: number;
  bodyFetchMode: DevtoBodyFetchMode;
  articles: DevtoArticle[];
}

const trendingFile = devtoTrendingData as unknown as DevtoTrendingFile;

export function getDevtoTrendingFile(): DevtoTrendingFile {
  return trendingFile;
}

export function getDevtoTopArticles(limit = 50): DevtoArticle[] {
  // Already sorted by trendingScore desc by the scraper.
  if (trendingFile.articles.length <= limit) return trendingFile.articles;
  return trendingFile.articles.slice(0, limit);
}
