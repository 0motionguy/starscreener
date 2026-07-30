// /docs/api — server-side OpenAPI spec loader.
//
// Mirrors the loader used by `/api/openapi.json/route.ts` but keeps a
// separate module-scope cache so the docs page never blocks on the API
// route's cold-start fetch. The spec is read once per Lambda cold start
// and then served from memory.
//
// `getApiCatalog()` returns a denormalised view of the spec that is
// directly renderable: operations are flattened, `$ref`s on parameters
// and responses are resolved against `components`, and ops are grouped
// by primary tag in display order.
//
// Resolution is intentionally shallow — only one level of `$ref` is
// followed (enough for the parameter / response refs that this spec
// actually uses). Deep schema refs (e.g. nested `CanonicalRepoProfile`)
// are left as `{ $ref: "..." }` markers; the page renders those as a
// "see schema below" hint rather than chasing an arbitrarily deep tree.

import { readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Spec shape (only what we read)
// ---------------------------------------------------------------------------

export interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

export interface OpenApiSchema {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  $ref?: string;
}

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchema }>;
  headers?: Record<string, { schema?: OpenApiSchema; description?: string }>;
}

export interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
  responses?: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary?: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Partial<Record<string, OpenApiOperation>>>;
  components?: {
    parameters?: Record<string, OpenApiParameter>;
    responses?: Record<string, OpenApiResponse>;
    schemas?: Record<string, OpenApiSchema>;
    securitySchemes?: Record<
      string,
      {
        type: string;
        scheme?: string;
        in?: string;
        name?: string;
        description?: string;
      }
    >;
  };
}

// ---------------------------------------------------------------------------
// Denormalised view
// ---------------------------------------------------------------------------

export interface ApiEndpoint {
  /** HTTP method, lowercase (`get`, `post`, ...). */
  method: string;
  /** Path template (`/api/repos/{owner}/{name}`). */
  path: string;
  /** Stable anchor id derived from method + path. */
  anchor: string;
  tags: string[];
  summary: string;
  description: string;
  operationId: string;
  parameters: OpenApiParameter[];
  requestBodyExample?: unknown;
  requestBodySchema?: OpenApiSchema;
  responses: Array<{
    status: string;
    description: string;
    contentType?: string;
    schemaRef?: string;
    schemaSummary?: string;
  }>;
  security: string[];
}

export interface ApiSection {
  tag: string;
  description: string;
  endpoints: ApiEndpoint[];
}

export interface ApiCatalog {
  title: string;
  version: string;
  summary: string;
  description: string;
  servers: Array<{ url: string; description?: string }>;
  securitySchemes: Array<{
    id: string;
    type: string;
    scheme?: string;
    in?: string;
    name?: string;
    description?: string;
  }>;
  sections: ApiSection[];
  totalEndpoints: number;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

let cachedSpec: OpenApiSpec | null = null;
let cachedCatalog: ApiCatalog | null = null;

function loadSpec(): OpenApiSpec {
  if (cachedSpec) return cachedSpec;
  const specPath = path.join(process.cwd(), "docs", "openapi.json");
  const raw = readFileSync(specPath, "utf8");
  const parsed = JSON.parse(raw) as OpenApiSpec;
  cachedSpec = parsed;
  return parsed;
}

function resolveRef<T>(spec: OpenApiSpec, ref: string): T | null {
  // Only handle local refs like `#/components/parameters/OwnerPath`.
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let cursor: unknown = spec;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return (cursor as T) ?? null;
}

function resolveParameter(
  spec: OpenApiSpec,
  param: OpenApiParameter | { $ref: string },
): OpenApiParameter | null {
  if ("$ref" in param && typeof param.$ref === "string") {
    return resolveRef<OpenApiParameter>(spec, param.$ref);
  }
  return param as OpenApiParameter;
}

function resolveResponse(
  spec: OpenApiSpec,
  response: OpenApiResponse | { $ref: string },
): OpenApiResponse | null {
  if ("$ref" in response && typeof response.$ref === "string") {
    return resolveRef<OpenApiResponse>(spec, response.$ref);
  }
  return response as OpenApiResponse;
}

function anchorFor(method: string, opPath: string): string {
  // Stable anchor: `op-get-api-repos-owner-name`.
  const slug = opPath
    .replace(/[{}]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `op-${method.toLowerCase()}-${slug}`;
}

function summariseSchema(schema?: OpenApiSchema): string | undefined {
  if (!schema) return undefined;
  if (schema.$ref) {
    return schema.$ref.replace(/^#\/components\/schemas\//, "");
  }
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return schema.type ?? undefined;
}

const METHOD_ORDER = ["get", "post", "put", "patch", "delete", "options", "head"];

function buildCatalog(spec: OpenApiSpec): ApiCatalog {
  const endpoints: ApiEndpoint[] = [];

  for (const [opPath, methods] of Object.entries(spec.paths)) {
    if (!methods) continue;
    for (const method of METHOD_ORDER) {
      const op = methods[method];
      if (!op) continue;

      const rawParams = op.parameters ?? [];
      const params: OpenApiParameter[] = [];
      for (const p of rawParams) {
        const resolved = resolveParameter(
          spec,
          p as OpenApiParameter | { $ref: string },
        );
        if (resolved) params.push(resolved);
      }

      const responses: ApiEndpoint["responses"] = [];
      for (const [status, raw] of Object.entries(op.responses ?? {})) {
        const resolved = resolveResponse(
          spec,
          raw as OpenApiResponse | { $ref: string },
        );
        if (!resolved) continue;
        const jsonContent = resolved.content?.["application/json"];
        const sseContent = resolved.content?.["text/event-stream"];
        const content = jsonContent ?? sseContent;
        responses.push({
          status,
          description: resolved.description ?? "",
          contentType: jsonContent
            ? "application/json"
            : sseContent
              ? "text/event-stream"
              : undefined,
          schemaRef: content?.schema?.$ref,
          schemaSummary: summariseSchema(content?.schema),
        });
      }

      const requestBodyJson = op.requestBody?.content?.["application/json"];

      endpoints.push({
        method: method.toLowerCase(),
        path: opPath,
        anchor: anchorFor(method, opPath),
        tags: op.tags ?? [],
        summary: op.summary ?? "",
        description: op.description ?? "",
        operationId: op.operationId ?? "",
        parameters: params,
        requestBodySchema: requestBodyJson?.schema,
        responses,
        security:
          op.security?.flatMap((entry) => Object.keys(entry)) ?? [],
      });
    }
  }

  // Group by first tag (matches the OpenAPI convention for primary tag).
  const tagOrder = (spec.tags ?? []).map((t) => t.name);
  const tagDescription = new Map(
    (spec.tags ?? []).map((t) => [t.name, t.description ?? ""]),
  );
  const groups = new Map<string, ApiEndpoint[]>();
  for (const ep of endpoints) {
    const primary = ep.tags[0] ?? "Other";
    if (!groups.has(primary)) groups.set(primary, []);
    groups.get(primary)!.push(ep);
  }

  // Preserve declared tag order; tags that exist in the spec but had no
  // operations are dropped. Unknown tags (no spec entry) sort to the end
  // alphabetically.
  const orderedTags: string[] = [];
  for (const tag of tagOrder) if (groups.has(tag)) orderedTags.push(tag);
  for (const tag of [...groups.keys()].sort()) {
    if (!orderedTags.includes(tag)) orderedTags.push(tag);
  }

  const sections: ApiSection[] = orderedTags.map((tag) => ({
    tag,
    description: tagDescription.get(tag) ?? "",
    endpoints: groups.get(tag) ?? [],
  }));

  const securitySchemes = Object.entries(spec.components?.securitySchemes ?? {}).map(
    ([id, scheme]) => ({ id, ...scheme }),
  );

  return {
    title: spec.info.title,
    version: spec.info.version,
    summary: spec.info.summary ?? "",
    description: spec.info.description ?? "",
    servers: spec.servers ?? [],
    securitySchemes,
    sections,
    totalEndpoints: endpoints.length,
  };
}

export function getApiCatalog(): ApiCatalog {
  if (cachedCatalog) return cachedCatalog;
  const spec = loadSpec();
  cachedCatalog = buildCatalog(spec);
  return cachedCatalog;
}

// Test-only escape hatch — same pattern as the openapi.json route.
const DOCS_API_TEST_RESET = Symbol.for("trendingrepo.docs.api.test.reset");
(globalThis as unknown as Record<symbol, () => void>)[DOCS_API_TEST_RESET] =
  () => {
    cachedSpec = null;
    cachedCatalog = null;
  };
