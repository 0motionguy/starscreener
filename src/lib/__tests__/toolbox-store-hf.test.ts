import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchHfDatasetsFromToolbox,
  fetchHfModelsFromToolbox,
  fetchHfSpacesFromToolbox,
} from "../toolbox-store-hf";

function fakeFetch(responses: {
  status?: number;
  body?: unknown;
  throwError?: Error;
}): typeof fetch {
  return (async () => {
    if (responses.throwError) throw responses.throwError;
    return {
      ok: (responses.status ?? 200) >= 200 && (responses.status ?? 200) < 300,
      status: responses.status ?? 200,
      json: async () => responses.body,
    } as Response;
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// HF models
// ---------------------------------------------------------------------------

test("HF models: shapes happy-path response into HfTrendingFile", async () => {
  const result = await fetchHfModelsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "t1",
            target_kind: "url",
            target_identity: "https://huggingface.co/SulphurAI/Sulphur-2-base",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.huggingface.models",
            produced_at: "2026-05-13T09:00:00Z",
            fields: {
              id: "SulphurAI/Sulphur-2-base",
              rank: 1,
              author: "SulphurAI",
              downloads: 535069,
              likes: 769,
              trending_score: 468,
              pipeline_tag: "text-to-video",
              tags: ["diffusers", "gguf"],
            },
          },
          {
            target_id: "t2",
            target_kind: "url",
            target_identity: "https://huggingface.co/Zyphra/ZAYA1-8B",
            scan_id: "s1",
            run_id: "r2",
            signal_type: "trending.huggingface.models",
            produced_at: "2026-05-13T08:00:00Z",
            fields: {
              id: "Zyphra/ZAYA1-8B",
              rank: 2,
              author: "Zyphra",
              downloads: 110182,
              likes: 457,
              // trending_score absent — upstream HF API didn't populate
              tags: ["safetensors", "zaya"],
            },
          },
        ],
      },
    }),
  });

  assert.ok(result);
  assert.equal(result!.count, 2);
  assert.equal(result!.source, "toolbox:trending.huggingface.models");
  assert.equal(result!.fetchedAt, "2026-05-13T09:00:00.000Z");

  const top = result!.models[0];
  assert.equal(top.id, "SulphurAI/Sulphur-2-base");
  assert.equal(top.rank, 1);
  assert.equal(top.url, "https://huggingface.co/SulphurAI/Sulphur-2-base");
  assert.equal(top.trendingScore, 468);
  assert.equal(top.pipelineTag, "text-to-video");
  assert.equal(top.libraryName, null);
  assert.equal(top.createdAt, null);

  const second = result!.models[1];
  assert.equal(second.id, "Zyphra/ZAYA1-8B");
  // Missing upstream trending_score defaults to 0 so scoring pipeline ranks.
  assert.equal(second.trendingScore, 0);
});

test("HF models: returns null on fetch failure", async () => {
  const result = await fetchHfModelsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ status: 500 }),
  });
  assert.equal(result, null);
});

test("HF models: drops events with no id", async () => {
  const result = await fetchHfModelsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "t1",
            target_kind: "url",
            target_identity: "https://huggingface.co/owner/keeper",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.huggingface.models",
            produced_at: "2026-05-13T09:00:00Z",
            fields: { id: "owner/keeper", rank: 1, downloads: 100, likes: 5 },
          },
          {
            target_id: "t2",
            target_kind: "url",
            target_identity: "https://huggingface.co/owner/dropme",
            scan_id: "s1",
            run_id: "r2",
            signal_type: "trending.huggingface.models",
            produced_at: "2026-05-13T08:00:00Z",
            fields: { rank: 2, downloads: 50, likes: 1 }, // no id → drop
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(result!.models.length, 1);
  assert.equal(result!.models[0].id, "owner/keeper");
});

test("HF models: sorts by rank ascending (rank 1 first)", async () => {
  const result = await fetchHfModelsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 3,
        targets: [
          {
            target_id: "a",
            target_kind: "url",
            target_identity: "https://huggingface.co/a/three",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.huggingface.models",
            produced_at: "2026-05-13T09:00:00Z",
            fields: { id: "a/three", rank: 3 },
          },
          {
            target_id: "b",
            target_kind: "url",
            target_identity: "https://huggingface.co/b/one",
            scan_id: "s1",
            run_id: "r2",
            signal_type: "trending.huggingface.models",
            produced_at: "2026-05-13T09:00:00Z",
            fields: { id: "b/one", rank: 1 },
          },
          {
            target_id: "c",
            target_kind: "url",
            target_identity: "https://huggingface.co/c/two",
            scan_id: "s1",
            run_id: "r3",
            signal_type: "trending.huggingface.models",
            produced_at: "2026-05-13T09:00:00Z",
            fields: { id: "c/two", rank: 2 },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.deepEqual(
    result!.models.map((m) => m.rank),
    [1, 2, 3],
  );
});

// ---------------------------------------------------------------------------
// HF spaces
// ---------------------------------------------------------------------------

test("HF spaces: shapes happy-path with sdk + spaces URL", async () => {
  const result = await fetchHfSpacesFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "s1",
            target_kind: "url",
            target_identity: "https://huggingface.co/spaces/Onise/Qwen",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.huggingface.spaces",
            produced_at: "2026-05-13T09:28:09Z",
            fields: {
              id: "Onise/Qwen",
              rank: 1,
              author: "Onise",
              likes: 435,
              trending_score: 198,
              sdk: "gradio",
              tags: ["gradio", "mcp-server"],
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  const sp = result!.spaces[0];
  assert.equal(sp.url, "https://huggingface.co/spaces/Onise/Qwen");
  assert.equal(sp.sdk, "gradio");
  assert.deepEqual(sp.models, []);
  assert.equal(result!.source, "toolbox:trending.huggingface.spaces");
});

test("HF spaces: returns null on body without targets array", async () => {
  const result = await fetchHfSpacesFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ body: { count: 0 } }),
  });
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// HF datasets
// ---------------------------------------------------------------------------

test("HF datasets: shapes happy-path with datasets URL", async () => {
  const result = await fetchHfDatasetsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "d1",
            target_kind: "url",
            target_identity: "https://huggingface.co/datasets/owner/ds",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.huggingface.datasets",
            produced_at: "2026-05-13T09:22:19Z",
            fields: {
              id: "owner/ds",
              rank: 1,
              author: "owner",
              downloads: 17156,
              likes: 97,
              trending_score: 64,
              tags: ["task_categories:text-to-3d"],
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  const d = result!.datasets[0];
  assert.equal(d.url, "https://huggingface.co/datasets/owner/ds");
  assert.equal(d.downloads, 17156);
  assert.equal(d.trendingScore, 64);
});

test("HF datasets: tolerates non-array tags", async () => {
  const result = await fetchHfDatasetsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "d1",
            target_kind: "url",
            target_identity: "https://huggingface.co/datasets/owner/ds",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.huggingface.datasets",
            produced_at: "2026-05-13T09:22:19Z",
            fields: {
              id: "owner/ds",
              rank: 1,
              downloads: 100,
              likes: 5,
              tags: "not-an-array",
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.deepEqual(result!.datasets[0].tags, []);
});
