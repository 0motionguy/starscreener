// GET /docs
//
// Thin redirect to the statically served Redoc reference at
// `/reference.html`. The real rendering lives in `public/reference.html`
// so the ~60 KB Redoc CDN bundle never touches the Next.js app bundle —
// only visitors who open the docs page pay for it.
//
// The site root layout wraps every page in the header / sidebar chrome,
// which fights Redoc's full-viewport layout. A static HTML file in
// `/public` sidesteps the chrome entirely. This route handler keeps the
// canonical, bookmarkable `/docs` URL and returns a proper HTTP 307 so
// crawlers, curl, and browsers all agree on the destination (the page
// variant relies on a <meta refresh> fallback which is slower and worse
// for SEO).
//
// Air-gapped deployments: the rendered HTML references the Redocly CDN.
// See the comment in `public/reference.html` for how to swap to an
// internal mirror.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
// Force dynamic so the redirect evaluates against the incoming request's
// origin — avoids being baked to a relative redirect at build time.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest): NextResponse {
  const target = new URL("/reference.html", req.nextUrl.origin);
  return NextResponse.redirect(target, { status: 307 });
}
