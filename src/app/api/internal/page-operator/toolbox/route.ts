import { NextResponse } from "next/server";
import { z } from "zod";

import { errorEnvelope } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";

export const runtime = "nodejs";

const requestSchema = z.object({
  action: z.enum([
    "send_to_toolbox_scan",
    "deep_crawl_repo_docs",
    "scan_llms_txt",
    "scan_mcp_readiness",
    "scan_agent_readiness",
    "generate_founder_brief",
    "generate_competitor_matrix",
  ]),
  repos: z.array(z.string()).max(5).default([]),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, requestSchema, {
    publicMessage: "invalid_toolbox_handoff",
  });
  if (!parsed.ok) return parsed.response;

  const apiUrl = process.env.TOOLBOX_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.TOOLBOX_API_KEY;
  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      {
        ...errorEnvelope(
          "Toolbox handoff needs TOOLBOX_API_URL and TOOLBOX_API_KEY on the server.",
          "toolbox_not_configured",
        ),
        message: "Toolbox handoff needs TOOLBOX_API_URL and TOOLBOX_API_KEY on the server.",
      },
      { status: 503 },
    );
  }

  const res = await fetch(`${apiUrl}/v1/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      mode: "plan_only",
      intent: parsed.data.action,
      input: { repos: parsed.data.repos, source: "trendingrepo.page_operator" },
    }),
  });

  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
