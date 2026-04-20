# NOTICE

This directory contains data files imported from
[pingcap/ossinsight](https://github.com/pingcap/ossinsight), licensed under
the Apache License, Version 2.0.

## Attribution

- **Upstream repository:** https://github.com/pingcap/ossinsight
- **Upstream commit copied from:** `63265a80a110abe5b0dfdf04d768462537b0a6a1`
- **Upstream path:** `configs/collections/*.yml`
- **Sync date:** 2026-04-20
- **License text:** see [LICENSE.upstream](./LICENSE.upstream)
- **License URL:** https://www.apache.org/licenses/LICENSE-2.0

## Modifications

- Filenames stripped of the upstream `NNNNN.` numeric prefix so the slug
  maps 1:1 to the StarScreener `/collections/[slug]` route. The numeric
  `id` field inside each YAML is preserved verbatim for traceability.
- Only the 28 AI-relevant YAMLs are imported; the other ~110 collections
  from upstream (web frameworks, databases, game engines, etc.) are out
  of scope.
- No changes to YAML content (`id`, `name`, `items`) — files are
  byte-for-byte identical to upstream aside from the filename rename
  described above.

## Files imported

| Local file                          | Upstream file                                |
|-------------------------------------|----------------------------------------------|
| `a2a-protocol.yml`                  | `configs/collections/10139.a2a-protocol.yml` |
| `agent-harness.yml`                 | `configs/collections/10141.agent-harness.yml` |
| `agent-skills.yml`                  | `configs/collections/10124.agent-skills.yml` |
| `ai-agent-frameworks.yml`           | `configs/collections/10098.ai-agent-frameworks.yml` |
| `ai-agent-memory.yml`               | `configs/collections/10114.ai-agent-memory.yml` |
| `ai-browser-agents.yml`             | `configs/collections/10113.ai-browser-agents.yml` |
| `ai-code-review.yml`                | `configs/collections/10136.ai-code-review.yml` |
| `ai-coding-assistants.yml`          | `configs/collections/10112.ai-coding-assistants.yml` |
| `ai-finops.yml`                     | `configs/collections/10130.ai-finops.yml` |
| `ai-governance.yml`                 | `configs/collections/10127.ai-governance.yml` |
| `ai-infrastructure.yml`             | `configs/collections/10125.ai-infrastructure.yml` |
| `ai-observability.yml`              | `configs/collections/10135.ai-observability.yml` |
| `ai-safety-alignment.yml`           | `configs/collections/10116.ai-safety-alignment.yml` |
| `ai-video-generation.yml`           | `configs/collections/10122.ai-video-generation.yml` |
| `artificial-intelligence.yml`       | `configs/collections/10010.artificial-intelligence.yml` |
| `chatgpt-alternatives.yml`          | `configs/collections/10075.chatgpt-alternatives.yml` |
| `chatgpt-apps.yml`                  | `configs/collections/10078.chatgpt-apps.yml` |
| `coding-agents.yml`                 | `configs/collections/10106.coding-agents.yml` |
| `edge-ai.yml`                       | `configs/collections/10126.edge-ai.yml` |
| `knowledge-graphs-for-ai.yml`       | `configs/collections/10134.knowledge-graphs-for-ai.yml` |
| `llm-finetuning.yml`                | `configs/collections/10110.llm-finetuning.yml` |
| `llm-inference-engines.yml`         | `configs/collections/10109.llm-inference-engines.yml` |
| `llm-tools.yml`                     | `configs/collections/10076.llm-tools.yml` |
| `mcp-servers.yml`                   | `configs/collections/10105.mcp-servers.yml` |
| `model-compression.yml`             | `configs/collections/10121.model-compression.yml` |
| `multimodal-ai.yml`                 | `configs/collections/10118.multimodal-ai.yml` |
| `rag-frameworks.yml`                | `configs/collections/10108.rag-frameworks.yml` |
| `vector-databases.yml`              | `configs/collections/10117.vector-databases.yml` |

## Resync procedure

1. `git clone https://github.com/pingcap/ossinsight.git /tmp/ossinsight`
2. For each `<slug>.yml` listed above, copy the matching
   `/tmp/ossinsight/configs/collections/NNNNN.<slug>.yml` over the local
   file (the table above is the authoritative mapping).
3. Update this NOTICE.md's **Upstream commit copied from** SHA and
   **Sync date**.
4. Commit with `chore(collections): resync from pingcap/ossinsight@<sha>`.

Upstream's `configs/collections/` occasionally adds new collections and
updates `items:` lists as repos join or age out. There is no automated
sync workflow in StarScreener — this is a periodic manual step.
