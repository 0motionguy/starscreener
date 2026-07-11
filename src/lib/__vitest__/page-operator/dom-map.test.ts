import { describe, expect, it } from "vitest";

import { captureDomMap } from "@/lib/page-operator/dom-map";

describe("captureDomMap", () => {
  it("keeps visible agent controls and excludes hidden secrets", () => {
    document.title = "Search";
    document.body.innerHTML = `
      <main>
        <h1>Search repos</h1>
        <input data-agent-id="repo.search.input" data-agent-label="Search repositories" value="browser agent" />
        <input data-agent-id="private.token" type="password" value="sekrit" />
        <input data-agent-id="hidden.csrf" type="hidden" value="csrf-token" />
        <button data-agent-id="repo.search.submit" data-agent-risk="safe">Search</button>
        <table>
          <tbody>
            <tr data-agent-role="repo.card" data-agent-id="repo.card.0" data-agent-repo-full-name="alibaba/page-agent">
              <td>alibaba/page-agent</td>
              <td><button data-agent-id="repo.card.0.compare">Compare</button></td>
            </tr>
          </tbody>
        </table>
      </main>
    `;

    const map = captureDomMap(document, { route: "/search" });
    const ids = map.controls.map((control) => control.agentId);

    expect(ids).toContain("repo.search.input");
    expect(ids).toContain("repo.card.0.compare");
    expect(ids).not.toContain("private.token");
    expect(JSON.stringify(map)).not.toContain("sekrit");
    expect(JSON.stringify(map)).not.toContain("csrf-token");
    expect(map.repoCards[0]).toMatchObject({
      agentId: "repo.card.0",
      fullName: "alibaba/page-agent",
    });
  });
});
