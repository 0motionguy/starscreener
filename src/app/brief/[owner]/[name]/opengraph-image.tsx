import { ImageResponse } from "next/og";

import { getBrief } from "@/lib/briefs";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "TrendingRepo editorial brief";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface RouteParams {
  params: Promise<{ owner: string; name: string }>;
}

export default async function BriefOGImage({ params }: RouteParams) {
  const { owner, name } = await params;
  const brief = await getBrief(owner, name);

  if (!brief) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#e2e8f0",
            fontSize: 48,
            fontFamily: "sans-serif",
            fontWeight: 700,
          }}
        >
          Brief not found
        </div>
      ),
      size,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(140deg, #0f172a 0%, #111827 60%, #1f2937 100%)",
          color: "#f8fafc",
          padding: "48px 60px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 20, opacity: 0.9 }}>{brief.owner}/{brief.name}</div>
          <div style={{ display: "flex", fontSize: 62, lineHeight: 1.06, fontWeight: 800 }}>{brief.hook}</div>
          <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, opacity: 0.92 }}>{brief.what}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, opacity: 0.82 }}>
          <span>TrendingRepo Editorial Brief</span>
          <span>{brief.written_at.slice(0, 10)}</span>
        </div>
      </div>
    ),
    size,
  );
}