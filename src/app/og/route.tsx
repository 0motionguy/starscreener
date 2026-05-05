// TrendingRepo — Dynamic OG image route
//
// Parameterised 1200×630 social card. Pages call /og?title=...&subtitle=... to
// get a per-page preview without authoring a static opengraph-image.tsx for
// every leaf route. Built-in monospace + flat colour fields keeps the edge
// runtime payload tiny — no font fetches, no image decoding.

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.slice(0, 80) ?? "TrendingRepo";
  const subtitle =
    searchParams.get("subtitle")?.slice(0, 120) ??
    "Real-time momentum across every signal source";

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0a0a",
          color: "#ffffff",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "monospace",
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.6 }}>// trendingrepo.com</div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 32,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 36, opacity: 0.7, marginTop: 32 }}>
          {subtitle}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
