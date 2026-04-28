import { NextResponse, type NextRequest } from "next/server";

import { getIndexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ indexnowKey: string }> },
) {
  const expected = getIndexNowKey();
  if (!expected) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { indexnowKey } = await params;
  const requestedKey = indexnowKey.endsWith(".txt")
    ? indexnowKey.slice(0, -4)
    : null;

  if (!requestedKey || requestedKey !== expected) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return new NextResponse(expected, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
