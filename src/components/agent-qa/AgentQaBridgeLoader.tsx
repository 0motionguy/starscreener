"use client";

import { useEffect } from "react";

// Both reads inline at build time: production bundles resolve `enabled` to a
// static false and never request the bridge chunk.
const enabled =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_TRENDINGREPO_AGENT_QA_ENABLED === "1";

/** Dev-only Agent QA bridge mount — adapter lives in src/lib/agent-qa/. */
export function AgentQaBridgeLoader() {
  useEffect(() => {
    if (!enabled) return;
    void import("@/lib/agent-qa/bridge").then((m) => m.mountAgentQa());
  }, []);
  return null;
}
