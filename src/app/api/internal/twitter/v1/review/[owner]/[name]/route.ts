import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { errorEnvelope } from "@/lib/api/error-response";
import { getTwitterAdminReview } from "@/lib/twitter";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const { owner, name } = await params;
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json(errorEnvelope("Invalid repo slug"), { status: 400 });
  }

  const review = await getTwitterAdminReview(`${owner}/${name}`);
  if (!review) {
    return NextResponse.json(errorEnvelope("Twitter review data not found for repo"), { status: 404 });
  }

  return NextResponse.json(review);
}
