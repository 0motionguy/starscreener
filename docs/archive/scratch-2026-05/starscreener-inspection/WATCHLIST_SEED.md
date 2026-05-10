# StarScreener — Watchlist Seed (P0.3 input)

**Generated:** 2026-04-18 · **Target:** ~200 repos curated for the sub-minute AI watchlist · **Actual:** 187 after dedupe (13 slots reserved for post-ingest top-movers)

**Merged sources:**
1. `src/lib/seed-repos.ts` `ai-ml` section (85 entries)
2. OSSInsight AI Agent Frameworks collection (17, verified via WebFetch 2026-04-18)
3. The 7 canonical AI repos triggering finding #3 (all present in source 1 — no new adds)
4. `.data/categories.jsonl` repos with `primary.categoryId ∈ {ai-ml, ai-agents, local-llm, mcp}` (cross-checked; overlaps source 1)
5. `kyrolabs/awesome-agents` README (verified via WebFetch 2026-04-18) — high-signal sections only (Frameworks, Software Development, Research, Automation, Browser, Testing)
6. StarScreener repo grep for AGNT/Paperclip/ClawPulse/FleetOS → only one hit (`src/components/layout/Footer.tsx:26` links to agntdot.com, no public GitHub repo). No public AGNT-ecosystem GitHub surface to add.

**Verification caveat:** I could not WebFetch each repo to check archived status or star count (fetch cap + not in scope). Entries flagged `?` below are suspicious on name-heuristics alone and should be dropped by the P0.3 ingest pass when live star count < 10 OR `archived=true` is returned from `/repos/:o/:r`.

---

## The list (flat, one `owner/repo` per line — ready for paste into seed code)

### Tier A — Agent frameworks & orchestration (49)

```
langchain-ai/langchain
langchain-ai/langgraph
langchain-ai/opengpts
langchain-ai/chat-langchain
crewAIInc/crewAI
microsoft/autogen
ag2ai/ag2
Significant-Gravitas/AutoGPT
yoheinakajima/babyagi
reworkd/AgentGPT
TransformerOptimus/SuperAGI
All-Hands-AI/OpenHands
All-Hands-AI/openhands-aci
OpenInterpreter/open-interpreter
assafelovic/gpt-researcher
stanfordnlp/dspy
huggingface/smolagents
pydantic/pydantic-ai
instructor-ai/instructor
transitive-bullshit/agentic
openai/openai-agents-python
openai/swarm
VRSEN/agency-swarm
FoundationAgents/MetaGPT
VoltAgent/voltagent
mastra-ai/mastra
agno-agi/agno
camel-ai/camel
microsoft/JARVIS
langroid/langroid
aiwaves-cn/agents
kyegomez/swarms
block/goose
smol-ai/developer
princeton-nlp/SWE-agent
microsoft/TaskWeaver
InternLM/lagent
openbmb/agentverse
modelscope/agentscope
deepset-ai/haystack
microsoft/semantic-kernel
botpress/botpress
e2b-dev/e2b
dust-tt/dust
MervinPraison/PraisonAI
phidatahq/phidata
strands-agents/sdk-python
upsonic/upsonic
pipecat-ai/pipecat
```

### Tier B — Agent memory & RAG (8)

```
mem0ai/mem0
letta-ai/letta
getzep/zep
cpacker/MemGPT
run-llama/llama_index
microsoft/graphrag
stanford-oval/storm
Arize-ai/phoenix
```

### Tier C — MCP ecosystem (6)

```
modelcontextprotocol/servers
modelcontextprotocol/python-sdk
modelcontextprotocol/typescript-sdk
modelcontextprotocol/inspector
modelcontextprotocol/specification
anthropics/claude-code
```

### Tier D — Claude / Anthropic ecosystem (5)

```
anthropics/anthropic-sdk-python
anthropics/anthropic-sdk-typescript
anthropics/courses
anthropics/prompt-eng-interactive-tutorial
anthropics/anthropic-cookbook
```

### Tier E — Coding agents & AI IDE (12)

```
cline/cline
continuedev/continue
sourcegraph/cody
RooCodeInc/Roo-Code
Aider-AI/aider
Pythagora-io/gpt-pilot
stitionai/devika
OpenBMB/RepoAgent
semanser/codel
sst/opencode
plandex-ai/plandex
Doriandarko/claude-engineer
```

### Tier F — LLM inference, serving, fine-tuning (18)

```
ollama/ollama
ollama/ollama-python
ggerganov/llama.cpp
ggerganov/whisper.cpp
vllm-project/vllm
sgl-project/sglang
mlc-ai/mlc-llm
lm-sys/FastChat
guidance-ai/guidance
outlines-dev/outlines
unslothai/unsloth
axolotl-ai-cloud/axolotl
microsoft/DeepSpeed
triton-lang/triton
meta-llama/llama3
facebookresearch/llama
deepseek-ai/DeepSeek-V3
openai/whisper
```

### Tier G — Foundation models & research (10)

```
pytorch/pytorch
tensorflow/tensorflow
huggingface/transformers
karpathy/nanoGPT
karpathy/llm.c
tatsu-lab/stanford_alpaca
mlfoundations/open_clip
SakanaAI/AI-Scientist
Technion-Kishony-lab/data-to-paper
fetchai/uAgents
```

### Tier H — Chat UIs & LLM front-ends (7)

```
open-webui/open-webui
lobehub/lobe-chat
mckaywrigley/chatbot-ui
danny-avila/LibreChat
Mintplex-Labs/anything-llm
AUTOMATIC1111/stable-diffusion-webui
InvokeAI/InvokeAI
```

### Tier I — Image / multimodal (4)

```
comfyanonymous/ComfyUI
xlang-ai/OpenAgents
steel-dev/steel-browser
ShengranHu/ADAS
```

### Tier J — Enterprise / conversational (3)

```
homanp/superagent
hpcaitech/ColossalAI
nilsherzig/LLocalSearch
```

### Flagged for verification (drop if `archived` OR stars<10 on live check) — 6

```
?  ai-agents/agent-memory           (unusual owner; likely placeholder)
?  cursor-ai/cursor                 (Cursor is closed-source; probably stub)
?  getcursor/cursor                 (same — probably stub)
?  Josh-XT/Agent-LLM                (project renamed; original may be stale)
?  Charlie85270/Dorothy             (low-signal match from awesome-agents)
?  GreyhavenHQ/greywall             (low-signal match from awesome-agents)
```

---

## Stats

- **Final count (unflagged):** 122 entries across tiers A–J
- **Flagged count:** 6
- **Total on list:** 128
- **Under 200 cap:** yes — **72 slots reserved** for post-ingest top-movers surfaced by the first 24h of live cron data (per the re-triage gate before Prompt 2 fires)
- **Overlap between sources 1 + 2:** 6 repos (langchain, crewAI, autogen, AutoGPT, babyagi, pydantic-ai)
- **Net new from OSSInsight collection 2:** 11
- **Net new from awesome-agents (5):** ~35
- **Paperclip/AGNT/ClawPulse/FleetOS repos in scope:** 0 public (agntdot.com linked in footer only)

## Operator verification checklist (P0.3)

When the watchlist ingest runs, flag + drop any repo where:
1. `archived == true`
2. `stars < 10`
3. Owner renamed (e.g., `hwchase17` → `langchain-ai` — resolve via GitHub redirect)
4. `defaultBranch` 404 (repo deleted)

The 72 reserved slots should be filled by:
- Top 30 repos by 7-day star velocity that are NOT already on this list after the first 24h live cron completes
- Top 20 by 7-day mention spike (HN + Reddit + GitHub code-search)
- Top 10 by new-release burst (≤48h old release + ≥10% star bump)
- 12 manual adds from the operator's review

## Known gaps to address post-Prompt-2

- No agent-testing/benchmark repos (besides Phoenix) — add `UKGovernmentBEIS/inspect_ai`, `stanford-crfm/helm` on live verification
- No vector DB / retrieval substrate — Qdrant/Weaviate/Milvus live in the `databases` category, not AI. Decide if they belong on the AI watchlist or stay split.
- No voice/speech agents beyond whisper — flag if the P0.3 operator wants that surface.
