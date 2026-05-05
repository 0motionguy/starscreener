import test from "node:test";
import assert from "node:assert/strict";

import { buildRepoPageSchemas } from "../seo-repo-schemas";
import { absoluteUrl, SITE_URL } from "../seo";
import { buildRepoSubpageSchema } from "../seo-repo-schemas";

test("buildRepoPageSchemas includes SoftwareSourceCode for repo detail pages", () => {
  const schemas = buildRepoPageSchemas({
    owner: "vercel",
    name: "next.js",
    description: "The React Framework",
    language: "TypeScript",
    topics: ["react", "framework"],
    stars: 1000,
    forks: 100,
    createdAt: "2020-01-01T00:00:00.000Z",
    lastCommitAt: "2026-01-01T00:00:00.000Z",
    momentumScore: 80,
    category: "web-frameworks",
  });

  const sourceCode = schemas.find(
    (schema) => schema["@type"] === "SoftwareSourceCode",
  );

  assert.ok(sourceCode, "expected SoftwareSourceCode JSON-LD entity");
  assert.equal(sourceCode["@context"], "https://schema.org");
  assert.equal(sourceCode["@id"], `${absoluteUrl("/repo/vercel/next.js")}#code`);
  assert.equal(sourceCode.url, absoluteUrl("/repo/vercel/next.js"));
  assert.equal(sourceCode.codeRepository, "https://github.com/vercel/next.js");
  assert.deepEqual(sourceCode.publisher, { "@id": `${SITE_URL}#organization` });
  assert.deepEqual(sourceCode.isPartOf, { "@id": `${SITE_URL}#website` });
});

test("buildRepoPageSchemas maps category into SoftwareApplication", () => {
  const schemas = buildRepoPageSchemas({
    owner: "openai",
    name: "codex",
    stars: 1,
    forks: 0,
    category: "ai-agents",
  });

  const app = schemas.find((schema) => schema["@type"] === "SoftwareApplication");
  assert.ok(app, "expected SoftwareApplication JSON-LD entity");
  assert.equal(app.applicationCategory, "ai-agents");
});

test("buildRepoSubpageSchema links subpage back to repo entity", () => {
  const schema = buildRepoSubpageSchema({
    owner: "vercel",
    name: "next.js",
    pagePath: "/repo/vercel/next.js/mentions",
    pageTitle: "vercel/next.js mentions",
    description: "Timeline and per-source mention breakdown.",
  });

  assert.equal(schema["@type"], "WebPage");
  assert.equal(schema["@id"], `${absoluteUrl("/repo/vercel/next.js/mentions")}#webpage`);
  assert.deepEqual(schema.about, {
    "@id": `${absoluteUrl("/repo/vercel/next.js")}#code`,
  });
  assert.deepEqual(schema.publisher, { "@id": `${SITE_URL}#organization` });
});

test("buildRepoPageSchemas adds category-specific JSON-LD properties", () => {
  const schemas = buildRepoPageSchemas({
    owner: "acme",
    name: "mcp-server",
    stars: 10,
    forks: 1,
    category: "mcp",
    categoryDetails: {
      kind: "mcp",
      mcp: {
        tools: ["search", "list"],
        resources: ["repos", "issues"],
        installSnippet: "npx mcp-server",
      },
    },
  });
  const sourceCode = schemas.find(
    (schema) => schema["@type"] === "SoftwareSourceCode",
  ) as Record<string, unknown> | undefined;
  assert.ok(sourceCode);
  const props = sourceCode.additionalProperty as Array<Record<string, unknown>> | undefined;
  assert.ok(Array.isArray(props) && props.length > 0);
  assert.equal(props[0]?.value, "mcp");
});
