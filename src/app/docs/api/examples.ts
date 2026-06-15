// /docs/api — curl example synthesis.
//
// Given an `ApiEndpoint`, produce a single copy-paste curl command that
// would actually work against `https://trendingrepo.com`. Picks plausible
// default values for path / query parameters from the schema (enum default
// → enum first → format-specific stub → "example"). Adds an Authorization
// header when the operation requires one.

import type { ApiEndpoint, OpenApiSchema } from "./spec";

const ENV_VAR_FOR_SCHEME: Record<string, string> = {
  cronBearer: "CRON_SECRET",
  adminBearer: "ADMIN_TOKEN",
  userBearer: "USER_TOKEN",
  sessionCookie: "SESSION_COOKIE",
};

// Hand-picked plausible values for repeated path params so the curl
// commands feel concrete (rather than `/repos/{owner}/{name}`).
const PATH_PARAM_DEFAULTS: Record<string, string> = {
  owner: "vercel",
  name: "next.js",
  handle: "torvalds",
  slug: "agents-leaderboard",
  id: "rule_01HF9X7QK2B0C8E2",
};

function sampleFromSchema(name: string, schema?: OpenApiSchema): string {
  if (!schema) return PATH_PARAM_DEFAULTS[name] ?? "example";
  if (schema.example !== undefined) return String(schema.example);
  if (schema.default !== undefined) return String(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return String(schema.enum[0]);
  }
  if (schema.format === "date-time") return "2026-06-15T00:00:00Z";
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof schema.minimum === "number") return String(schema.minimum);
    return "1";
  }
  if (schema.type === "boolean") return "true";
  return PATH_PARAM_DEFAULTS[name] ?? "example";
}

function buildPath(endpoint: ApiEndpoint): string {
  let path = endpoint.path;
  const pathParams = endpoint.parameters.filter((p) => p.in === "path");
  for (const param of pathParams) {
    const value = sampleFromSchema(param.name, param.schema);
    path = path.replace(`{${param.name}}`, value);
  }
  return path;
}

function buildQuery(endpoint: ApiEndpoint): string {
  const queryParams = endpoint.parameters.filter(
    (p) => p.in === "query" && p.required,
  );
  if (queryParams.length === 0) {
    // Include one optional param if it has a default — gives a more useful
    // copy-paste example for endpoints like /api/repos that have many
    // optional knobs.
    const withDefault = endpoint.parameters.find(
      (p) => p.in === "query" && p.schema?.default !== undefined,
    );
    if (!withDefault) return "";
    const value = sampleFromSchema(withDefault.name, withDefault.schema);
    return `?${withDefault.name}=${encodeURIComponent(value)}`;
  }
  const pairs = queryParams.map((param) => {
    const value = sampleFromSchema(param.name, param.schema);
    return `${param.name}=${encodeURIComponent(value)}`;
  });
  return `?${pairs.join("&")}`;
}

function buildAuthHeader(endpoint: ApiEndpoint): string[] {
  if (endpoint.security.length === 0) return [];
  // Pick the first declared scheme — the spec already orders by preference.
  const scheme = endpoint.security[0];
  const envVar = ENV_VAR_FOR_SCHEME[scheme] ?? "API_TOKEN";
  if (scheme === "sessionCookie") {
    return [`-H "Cookie: ss_user=$${envVar}"`];
  }
  return [`-H "Authorization: Bearer $${envVar}"`];
}

function buildBodyArg(endpoint: ApiEndpoint): { lines: string[]; hasBody: boolean } {
  if (!endpoint.requestBodySchema) return { lines: [], hasBody: false };
  // Build a minimal JSON body from the top-level required properties.
  // This is best-effort — the spec doesn't always declare requireds, in
  // which case we pick the first 2 properties to give the caller a starting
  // shape.
  const schema = endpoint.requestBodySchema;
  if (schema.$ref) {
    return {
      lines: [
        `  -H "Content-Type: application/json" \\`,
        `  -d '{ "see": "schema below" }'`,
      ],
      hasBody: true,
    };
  }
  const props = (schema as { properties?: Record<string, OpenApiSchema> })
    .properties;
  if (!props) return { lines: [], hasBody: false };
  const required = (schema as { required?: string[] }).required ?? [];
  const pickKeys = required.length > 0 ? required : Object.keys(props).slice(0, 2);
  const body: Record<string, string | number | boolean | null> = {};
  for (const key of pickKeys) {
    const sub = props[key];
    if (!sub) continue;
    if (Array.isArray(sub.enum) && sub.enum.length > 0) {
      body[key] = sub.enum[0] as string | number;
    } else if (sub.type === "integer" || sub.type === "number") {
      body[key] = typeof sub.minimum === "number" ? sub.minimum : 1;
    } else if (sub.type === "boolean") {
      body[key] = true;
    } else {
      body[key] = "example";
    }
  }
  return {
    lines: [
      `  -H "Content-Type: application/json" \\`,
      `  -d '${JSON.stringify(body)}'`,
    ],
    hasBody: true,
  };
}

const BASE_URL = "https://trendingrepo.com";

export function buildCurlExample(endpoint: ApiEndpoint): string {
  const method = endpoint.method.toUpperCase();
  const path = buildPath(endpoint);
  const query = buildQuery(endpoint);
  const auth = buildAuthHeader(endpoint);
  const body = buildBodyArg(endpoint);

  const lines: string[] = [];
  const methodFlag = method === "GET" ? "" : ` -X ${method}`;
  lines.push(`curl${methodFlag} "${BASE_URL}${path}${query}" \\`);
  for (let i = 0; i < auth.length; i++) {
    const isLast = i === auth.length - 1 && !body.hasBody;
    lines.push(`  ${auth[i]}${isLast ? "" : " \\"}`);
  }
  if (body.hasBody) {
    for (const bodyLine of body.lines) {
      lines.push(bodyLine);
    }
  }
  // If no auth or body, strip the trailing ` \` from the first line so the
  // command isn't broken across lines unnecessarily.
  if (auth.length === 0 && !body.hasBody) {
    lines[0] = lines[0].replace(/ \\$/, "");
  }
  return lines.join("\n");
}

/**
 * Produce a synthetic JSON response example. We don't have concrete
 * examples in the spec — the schemas reference `$ref` targets at the top
 * level — so we emit a one-liner that points the caller at the live URL,
 * which is the most useful action: "see the actual shape by curling it."
 *
 * For ops with a clear "ok-shaped" envelope we synthesize that instead.
 */
export function buildResponseHint(endpoint: ApiEndpoint): string {
  const ok = endpoint.responses.find((r) => r.status === "200");
  if (!ok) return "// see status codes below";
  if (ok.schemaRef) {
    const name = ok.schemaRef.replace(/^#\/components\/schemas\//, "");
    return `// 200 OK · application/json — shape: ${name}`;
  }
  if (ok.schemaSummary) {
    return `// 200 OK · application/json — ${ok.schemaSummary}`;
  }
  return "// 200 OK";
}

/** Compact method label for the badge — three-letter chunks fit a chip. */
export function methodTone(method: string): "accent" | "positive" | "warning" | "danger" | "neutral" {
  switch (method.toLowerCase()) {
    case "get":
      return "accent";
    case "post":
      return "positive";
    case "put":
    case "patch":
      return "warning";
    case "delete":
      return "danger";
    default:
      return "neutral";
  }
}
