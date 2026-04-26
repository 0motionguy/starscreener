// POST   /api/admin/login  { username, password }  → set ss_admin cookie
// DELETE /api/admin/login                         → clear ss_admin cookie
//
// Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD env vars. Both are
// compared with timingSafeEqual to blunt remote timing attacks. If either
// env is missing → 503. Password wrong → 401. Success → 7-day HttpOnly
// SameSite=Lax cookie signed with SESSION_SECRET.
//
// The existing Authorization: Bearer <ADMIN_TOKEN> path in verifyAdminAuth()
// is untouched — this endpoint adds a second, friendlier way to authenticate
// without removing the first.

import { NextRequest, NextResponse } from "next/server";

import { timingSafeEqualStr } from "@/lib/api/auth";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  signAdminSession,
} from "@/lib/api/admin-session";

export const dynamic = "force-dynamic";

interface LoginOk {
  ok: true;
  username: string;
}

interface LoginErr {
  ok: false;
  reason: "unauthorized" | "not_configured" | "bad_request";
  error?: string;
}

function configured(): {
  username: string;
  password: string;
  sessionSecret: string;
} | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!username || !password || !sessionSecret) return null;
  return { username, password, sessionSecret };
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<LoginOk | LoginErr>> {
  const config = configured();
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not_configured",
        error:
          "admin login not configured (set ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET in .env.local)",
      },
      { status: 503 },
    );
  }

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "bad_request", error: "body must be valid JSON" },
      { status: 400 },
    );
  }

  const providedUsername =
    typeof body.username === "string" ? body.username.trim() : "";
  const providedPassword =
    typeof body.password === "string" ? body.password : "";
  if (!providedUsername || !providedPassword) {
    return NextResponse.json(
      {
        ok: false,
        reason: "bad_request",
        error: "username and password are required",
      },
      { status: 400 },
    );
  }

  // Always run BOTH comparisons even if the first mismatches, so a wrong
  // username can't be distinguished from a wrong password by response time.
  const userOk = timingSafeEqualStr(providedUsername, config.username);
  const passOk = timingSafeEqualStr(providedPassword, config.password);
  if (!userOk || !passOk) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const token = signAdminSession({
    issuedAt: Date.now(),
    username: config.username,
  });

  const response = NextResponse.json<LoginOk>({
    ok: true,
    username: config.username,
  });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE(): Promise<NextResponse<{ ok: true }>> {
  const response = NextResponse.json({ ok: true as const });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
