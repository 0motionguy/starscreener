import type { RepoCategoryDetails } from "@/lib/repo-category-details";

interface RepoCategoryDetailsProps {
  details: RepoCategoryDetails | null;
}

export function RepoCategoryDetails({ details }: RepoCategoryDetailsProps) {
  if (!details || details.kind === "library") return null;

  if (details.kind === "mcp" && details.mcp) {
    return (
      <section className="v2-card mt-2 p-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
          {"// MCP PROFILE"}
        </p>
        <p className="text-xs text-text-secondary mt-1">Install: <code>{details.mcp.installSnippet}</code></p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <p className="text-[11px] font-medium text-text-secondary">Tools</p>
            <ul className="text-xs text-text-tertiary mt-1 space-y-1">
              {details.mcp.tools.length > 0 ? details.mcp.tools.map((tool) => <li key={tool}>• {tool}</li>) : <li>• none detected</li>}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-medium text-text-secondary">Resources</p>
            <ul className="text-xs text-text-tertiary mt-1 space-y-1">
              {details.mcp.resources.length > 0 ? details.mcp.resources.map((resource) => <li key={resource}>• {resource}</li>) : <li>• none detected</li>}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  if (details.kind === "skill" && details.skill) {
    return (
      <section className="v2-card mt-2 p-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
          {"// SKILL PROFILE"}
        </p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <p className="text-[11px] font-medium text-text-secondary">Frontmatter</p>
            <ul className="text-xs text-text-tertiary mt-1 space-y-1">
              {details.skill.frontmatter.length > 0 ? details.skill.frontmatter.map((row) => <li key={row.key}><b>{row.key}</b>: {row.value}</li>) : <li>none detected</li>}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-medium text-text-secondary">Version history</p>
            <ul className="text-xs text-text-tertiary mt-1 space-y-1">
              {details.skill.versionHistory.length > 0 ? details.skill.versionHistory.map((v) => <li key={v}>• {v}</li>) : <li>none detected</li>}
            </ul>
          </div>
        </div>
        {details.skill.bodyPreview ? (
          <p className="text-xs text-text-tertiary mt-2">{details.skill.bodyPreview}</p>
        ) : null}
      </section>
    );
  }

  if (details.kind === "agent" && details.agent) {
    return (
      <section className="v2-card mt-2 p-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
          {"// AGENT PROFILE"}
        </p>
        <p className="text-xs text-text-secondary mt-1">Role: {details.agent.personaRole}</p>
        <p className="text-[11px] font-medium text-text-secondary mt-2">Capabilities</p>
        <ul className="text-xs text-text-tertiary mt-1 space-y-1">
          {details.agent.capabilities.length > 0 ? details.agent.capabilities.map((cap) => <li key={cap}>• {cap}</li>) : <li>none detected</li>}
        </ul>
        <p className="text-[11px] font-medium text-text-secondary mt-2">Example invocations</p>
        <ul className="text-xs text-text-tertiary mt-1 space-y-1">
          {details.agent.exampleInvocations.length > 0 ? details.agent.exampleInvocations.map((ex) => <li key={ex}>• {ex}</li>) : <li>none detected</li>}
        </ul>
      </section>
    );
  }

  return null;
}

