// /s/[shortId] — resolve a compare-share shortlink back to the canonical
// /compare URL with full state encoded in the querystring, then 302.
//
// Reads `compare-share/{shortId}` from Redis via the global data-store.
// 404s on bad slug shape or unknown id; never throws.

import { notFound, redirect } from "next/navigation";

import { isShortId } from "@/lib/compare/short-id";
import { getDataStore } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompareSharePayload {
  shortId: string;
  createdAt: string;
  repos: string[];
  metric?: "stars" | "velocity" | "mindshare";
  window?: "7d" | "30d" | "90d" | "6m" | "1y" | "all";
  mode?: "date" | "timeline";
  scale?: "lin" | "log";
  theme?: string;
  watermark?: boolean;
}

interface PageProps {
  params: Promise<{ shortId: string }>;
}

export default async function ShortlinkPage({ params }: PageProps) {
  const { shortId } = await params;
  if (!isShortId(shortId)) notFound();

  const result = await getDataStore().read<CompareSharePayload>(
    `compare-share/${shortId}`,
  );
  if (!result.data) notFound();

  const payload = result.data;
  const search = new URLSearchParams();
  search.set("repos", payload.repos.join(","));
  if (payload.metric) search.set("metric", payload.metric);
  if (payload.window) search.set("window", payload.window);
  if (payload.mode) search.set("mode", payload.mode);
  if (payload.scale) search.set("scale", payload.scale);
  if (payload.theme) search.set("theme", payload.theme);
  if (typeof payload.watermark === "boolean") {
    search.set("watermark", payload.watermark ? "1" : "0");
  }

  redirect(`/compare?${search.toString()}`);
}
