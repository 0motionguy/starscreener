"use client";

import { useEffect } from "react";

/** Dev-only Agent QA bridge mount — adapter lives in src/lib/agent-qa/. */
export function AgentQaBridgeLoader() {
  useEffect(() => {
    // The gate must stay INLINE around the import(): webpack only skips
    // emitting the dynamic-import chunk when DefinePlugin folding proves
    // this exact branch dead at parse time. A hoisted `const enabled`
    // still emits the bridge chunk into .next/static — caught by
    // scripts/agent-qa-guard.mjs (marker: __AISO_AGENT__).
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_TRENDINGREPO_AGENT_QA_ENABLED === "1"
    ) {
      void import("@/lib/agent-qa/bridge").then((m) => m.mountAgentQa());
    }
  }, []);
  return null;
}
