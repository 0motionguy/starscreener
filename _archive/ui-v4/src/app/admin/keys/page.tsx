import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import { GET as getPoolState } from "@/app/api/admin/pool-state/route";

import { AdminKeysDashboard } from "./PoolAnomalies";
import type { AdminPoolStateResponse } from "@/app/api/admin/pool-state/route";

export const metadata: Metadata = {
  title: "Admin - Key Pools",
  description:
    "Operator view of GitHub, Reddit, Twitter fallback, and singleton source telemetry.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminKeysPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/keys");
  }

  const headerList = await headers();
  const request = new NextRequest("http://localhost/api/admin/pool-state", {
    headers: {
      cookie: headerList.get("cookie") ?? "",
    },
  });
  const response = await getPoolState(request);
  const initialState = (await response.json()) as
    | AdminPoolStateResponse
    | { ok: false; error: string };

  if (!initialState.ok) {
    return (
      <main className="mx-auto max-w-[1400px] px-5 py-10">
        <p
          className="v2-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Admin / Key Pools
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Pool telemetry unavailable
        </h1>
        <p className="mt-3 text-[13px]" style={{ color: "var(--v3-ink-300)" }}>
          {initialState.error}
        </p>
      </main>
    );
  }

  return <AdminKeysDashboard initialState={initialState} />;
}
