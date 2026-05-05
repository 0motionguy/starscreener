import { notFound, permanentRedirect } from "next/navigation";

import { CATEGORIES } from "@/lib/constants";

interface TrendingCategoryRedirectPageProps {
  params: Promise<{ slug: string }>;
}

const TRENDING_SLUG_ALIASES: Record<string, string> = {
  // Requested legacy buckets for TREND-22.
  ai: "ai-ml",
  devtools: "devtools",
  web: "web-frameworks",
  mobile: "mobile",
  game: "browser-automation",
  security: "security",
  data: "data-analytics",
  infra: "infrastructure",
  cli: "devtools",
  libraries: "devtools",
  frameworks: "web-frameworks",
  learning: "ai-ml",
  // Existing shorthand aliases.
  ml: "ai-ml",
  web3: "crypto-web3",
};

const CATEGORY_IDS = new Set(CATEGORIES.map((category) => category.id));

export default async function TrendingCategoryRedirectPage({
  params,
}: TrendingCategoryRedirectPageProps) {
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const categorySlug = TRENDING_SLUG_ALIASES[normalizedSlug] ?? normalizedSlug;

  if (!CATEGORY_IDS.has(categorySlug)) {
    notFound();
  }

  permanentRedirect(`/categories/${categorySlug}`);
}
