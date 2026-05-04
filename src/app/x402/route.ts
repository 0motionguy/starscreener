import type { NextRequest } from "next/server";

// x402 — HTTP 402 Payment Required entrypoint for agent-side micropayments.
// The AISO Agent-Readiness scanner treats a 402 status (with an x402 manifest
// payload) on this path as a positive x402 signal. This stub publishes the
// minimum viable manifest; payment routing is intentionally not implemented
// yet — when the protocol stabilises and a real wallet is wired in, the
// 402 response will carry signed payment-request fields the agent can act on.
//
// Spec reference: https://x402.org (HTTP 402 + payment-request envelope).
export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET(_req: NextRequest): Response {
  return jsonResponse(402);
}

export function HEAD(_req: NextRequest): Response {
  return new Response(null, {
    status: 402,
    headers: { "X-Payment-Required": "x402", "Cache-Control": "no-store" },
  });
}

export function POST(_req: NextRequest): Response {
  return jsonResponse(402);
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    },
  });
}

function jsonResponse(status: number): Response {
  const body = {
    type: "x402-payment-required",
    version: "0.1",
    status,
    accepts: ["x402"],
    networks: [],
    description:
      "x402 payment manifest stub. No active payment scheme is wired yet — this endpoint exists so AI agents can detect x402 capability.",
    docs: "https://x402.org",
    contact: "https://github.com/0motionguy/starscreener",
  };
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Required": "x402",
      "Cache-Control": "no-store",
    },
  });
}
