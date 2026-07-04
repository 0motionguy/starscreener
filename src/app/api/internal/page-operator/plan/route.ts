import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody } from "@/lib/api/parse-body";
import { planPageOperation } from "@/lib/page-operator/plan";

export const runtime = "nodejs";

const requestSchema = z.object({
  surface: z.string().default("trendingrepo"),
  command: z.string().min(1).max(500),
  route: z.string().default("/"),
  dom: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, requestSchema, {
    publicMessage: "invalid_page_operator_plan_request",
  });
  if (!parsed.ok) return parsed.response;

  return NextResponse.json(planPageOperation(parsed.data), {
    headers: { "Cache-Control": "no-store" },
  });
}
