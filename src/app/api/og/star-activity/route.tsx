import { NextResponse } from "next/server";

// Stub: route archived 2026-05-19 (UI v4 dismantle, post-archive 410 phase).
// Phase 2A.2 — OG image route; consumers (sitemap, share cards) archived.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return new NextResponse("archived", { status: 410 }); }
