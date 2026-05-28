// Glossary — definitional "What is X?" answer-surfaces at /glossary/[term].
//
// Pure AI-Overview / featured-snippet bait: a crisp original definition plus
// the live trending repos for the term (so the page is grounded in our data,
// not just prose). Each term links into the relevant category/best surfaces.
// Curated registry — not auto-generated — so every definition is accurate.

import { getDerivedRepos } from "@/lib/derived-repos";
import type { FaqEntry } from "@/lib/seo/structured-data";
import type { Repo } from "@/lib/types";

export interface GlossaryTerm {
  slug: string;
  /** Canonical display term, e.g. "AI agent". */
  term: string;
  /** One-sentence answer (the snippet/DefinedTerm description). */
  short: string;
  /** Full definition paragraphs (original prose). */
  body: string[];
  /** Surface to send readers to for the live ranked list. */
  related: { label: string; href: string };
  /** Repo selection for the "trending {term}" block. */
  categoryIds: string[];
  keywords: string[];
  /** Extra Q&A beyond the definition. */
  faq?: FaqEntry[];
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: "ai-agent",
    term: "AI agent",
    short:
      "An AI agent is a system that uses a large language model to plan and take actions toward a goal — calling tools, reading results, and iterating with little or no human input.",
    body: [
      "An AI agent wraps a large language model in a loop: it reasons about a goal, chooses an action (often calling an external tool or API), observes the result, and repeats until the task is done. The defining trait versus a plain chatbot is autonomy — the model decides the next step rather than just answering one prompt.",
      "Open-source agent frameworks provide the scaffolding for this loop: tool/function calling, memory, planning, and multi-agent orchestration. They range from coding agents that edit and run your repository to general task agents that browse the web or operate software.",
    ],
    related: { label: "Trending AI agents", href: "/categories/ai-agents" },
    categoryIds: ["ai-agents"],
    keywords: [],
    faq: [
      {
        q: "What is the difference between an AI agent and a chatbot?",
        a: "A chatbot responds to a single prompt; an AI agent runs an autonomous loop — it plans, calls tools, observes results, and keeps going until the goal is met or it gives up.",
      },
    ],
  },
  {
    slug: "mcp",
    term: "Model Context Protocol (MCP)",
    short:
      "MCP is an open standard that lets AI assistants connect to external tools, data, and services through one consistent interface, so any MCP client can use any MCP server.",
    body: [
      "The Model Context Protocol (MCP) defines a common contract between AI clients (Claude, IDE agents, custom apps) and servers that expose capabilities — a database, a file system, an API, a browser. Instead of bespoke glue per integration, you publish an MCP server once and the whole ecosystem can use it.",
      "MCP exploded across 2025-26 because it turns 'wire this one model to this one tool' into a reusable building block. The winning servers are the ones that stay compatible as the young spec evolves and solve an integration developers were previously hand-rolling.",
    ],
    related: { label: "Trending MCP servers", href: "/categories/mcp" },
    categoryIds: ["mcp"],
    keywords: [],
  },
  {
    slug: "rag",
    term: "RAG (Retrieval-Augmented Generation)",
    short:
      "RAG is a technique that retrieves relevant documents from a knowledge base and feeds them to a language model as context, so its answers are grounded in your data instead of only its training.",
    body: [
      "Retrieval-Augmented Generation (RAG) pairs a retriever with a generator. At query time the retriever finds the most relevant chunks — usually via a vector database and embeddings — and the language model answers using those chunks as context. This grounds responses in current, private, or domain-specific data the model never saw in training, and lets you cite sources.",
      "A typical open-source RAG stack combines an embedding model, a vector store, a chunking/ingestion pipeline, and an orchestration layer. RAG is the most common way teams add company knowledge to an LLM without fine-tuning.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml", "databases"],
    keywords: ["rag", "retrieval", "embedding", "vector"],
  },
  {
    slug: "vector-database",
    term: "vector database",
    short:
      "A vector database stores embeddings — numeric representations of text, images, or code — and finds the most similar ones fast, powering semantic search and RAG.",
    body: [
      "A vector database indexes high-dimensional embedding vectors and answers nearest-neighbour queries: given a query vector, return the most semantically similar stored items. This is the retrieval engine behind semantic search, recommendations, and RAG pipelines.",
      "Open-source options range from purpose-built vector stores to vector extensions bolted onto existing databases. The trade-offs are recall vs. latency, index type (HNSW, IVF), and how well it scales with your corpus.",
    ],
    related: { label: "Best vector databases", href: "/best/vector-databases" },
    categoryIds: ["databases"],
    keywords: ["vector", "embedding", "semantic", "ann", "similarity"],
  },
  {
    slug: "llm",
    term: "large language model (LLM)",
    short:
      "A large language model is a neural network trained on massive text corpora to predict the next token, giving it the ability to generate and understand human language.",
    body: [
      "A large language model (LLM) is a transformer-based neural network trained to predict the next token over enormous text datasets. That simple objective, at scale, yields emergent abilities: writing, reasoning, translation, coding, and tool use. Models are characterised by parameter count, context window, and training data.",
      "Open-source LLMs and the tooling around them — inference servers, quantization, fine-tuning frameworks — let teams run capable models on their own hardware instead of only through a hosted API.",
    ],
    related: { label: "Best open-source LLMs", href: "/best/open-source-llms" },
    categoryIds: ["ai-ml", "local-llm"],
    keywords: ["llm", "language model", "transformer", "inference", "model"],
  },
  {
    slug: "local-llm",
    term: "local LLM",
    short:
      "A local LLM is a language model that runs on your own machine or servers instead of a hosted API — for privacy, offline use, and cost control.",
    body: [
      "A local LLM runs inference on hardware you control. With quantization and efficient runtimes, capable open models now run on a laptop or a single GPU. Teams choose local for data privacy, offline operation, predictable cost, and no per-token API fees.",
      "The open-source local-LLM ecosystem covers inference engines, model runners with one-command setup, and UIs — the layer that turns raw model weights into something you can actually chat with or build on.",
    ],
    related: { label: "Best local LLM tools", href: "/best/local-llm-tools" },
    categoryIds: ["local-llm"],
    keywords: [],
  },
  {
    slug: "ai-coding-assistant",
    term: "AI coding assistant",
    short:
      "An AI coding assistant uses an LLM to help you write, edit, and debug code — from inline autocomplete to autonomous agents that implement whole tasks across a repository.",
    body: [
      "AI coding assistants span a spectrum: inline completion in your editor, chat-based pair programming, and autonomous coding agents that read your repo, plan a change, edit multiple files, run tests, and iterate. The autonomous end overlaps heavily with AI agents.",
      "Open-source options let you bring your own model (including local LLMs), keep code on your own infrastructure, and customise the workflow — increasingly important for teams with privacy or compliance constraints.",
    ],
    related: { label: "Best AI coding assistants", href: "/best/ai-coding-assistants" },
    categoryIds: ["ai-agents", "devtools"],
    keywords: ["coding agent", "coding assistant", "copilot", "pair program", "aider", "cline", "ai code"],
  },
  {
    slug: "browser-automation",
    term: "browser automation",
    short:
      "Browser automation drives a real web browser programmatically — clicking, typing, and navigating — for testing, scraping, and increasingly AI agents that operate the web.",
    body: [
      "Browser automation controls a headless or headed browser through code or an agent. Classic uses are end-to-end testing and web scraping; the fast-growing use is AI 'web operator' agents that navigate sites to complete tasks a human would do in a browser.",
      "Open-source stacks provide the driver layer (controlling the browser) and, increasingly, an agent layer that lets an LLM decide what to click next from a screenshot or the DOM.",
    ],
    related: { label: "Best browser automation tools", href: "/best/browser-automation-tools" },
    categoryIds: ["browser-automation"],
    keywords: [],
  },
  {
    slug: "embedding",
    term: "embedding",
    short:
      "An embedding is a numeric vector that represents the meaning of text, code, or an image, so similar items sit close together in vector space and can be compared mathematically.",
    body: [
      "An embedding is produced by an embedding model that maps an input — a sentence, a document, a snippet of code — to a fixed-length vector of numbers. Inputs with similar meaning land near each other, which turns 'is this similar?' into a fast distance calculation. Embeddings are the foundation of semantic search, recommendations, clustering, and retrieval-augmented generation.",
      "Open-source embedding models trade off dimensionality, speed, language coverage, and domain fit. The right choice depends on your data: a general model works for prose, while code or a specialised domain often benefits from a model trained for it.",
    ],
    related: { label: "Best vector databases", href: "/best/vector-databases" },
    categoryIds: ["ai-ml", "databases"],
    keywords: ["embedding", "vector"],
  },
  {
    slug: "fine-tuning",
    term: "fine-tuning",
    short:
      "Fine-tuning adapts a pre-trained model to a specific task or domain by continuing training on a smaller, targeted dataset, changing its behaviour without training from scratch.",
    body: [
      "Fine-tuning takes a capable base model and nudges it toward your task using your own examples. Full fine-tuning updates every weight; parameter-efficient methods like LoRA train only small adapters, making it far cheaper. Teams reach for fine-tuning when prompt engineering and retrieval are not enough to get consistent behaviour or a specific style.",
      "Open-source fine-tuning frameworks handle the training loop, data formatting, and adapter management. In practice the dataset matters more than the algorithm: a few hundred high-quality, well-labelled examples usually beat a large noisy set.",
    ],
    related: { label: "Best open-source LLMs", href: "/best/open-source-llms" },
    categoryIds: ["ai-ml", "local-llm"],
    keywords: ["fine-tun", "lora", "training"],
  },
  {
    slug: "prompt-engineering",
    term: "prompt engineering",
    short:
      "Prompt engineering is the practice of crafting a language model's input — instructions, examples, and structure — to reliably get the output you want.",
    body: [
      "Prompt engineering is the cheapest lever for steering a model before reaching for retrieval or fine-tuning. Effective techniques include giving clear instructions, showing a few worked examples (few-shot), asking for structured output, and prompting step-by-step reasoning for hard problems.",
      "As prompts move into production they need the same rigour as code: versioning, evaluation against test cases, and regression checks when you change a model. Open-source tooling exists for prompt management and systematic evaluation.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml"],
    keywords: [],
  },
  {
    slug: "transformer",
    term: "transformer",
    short:
      "A transformer is the neural-network architecture behind modern language models, using self-attention to weigh how every token in the input relates to every other.",
    body: [
      "The transformer replaced recurrent networks by processing a whole sequence in parallel and letting each token attend to all others through self-attention. That design scales efficiently on modern hardware and underlies essentially every current large language model.",
      "Open-source implementations of the architecture — and the model weights built on it — let teams study, run, and adapt transformers directly rather than only through a hosted API.",
    ],
    related: { label: "Best open-source LLMs", href: "/best/open-source-llms" },
    categoryIds: ["ai-ml"],
    keywords: ["transformer"],
  },
  {
    slug: "inference",
    term: "LLM inference",
    short:
      "Inference is the process of running a trained model to generate output — for an LLM, turning a prompt into tokens — and the stage where latency, throughput, and cost are decided.",
    body: [
      "Inference is the serving side of a model, distinct from training. For LLMs it is dominated by how fast tokens are generated and how many requests can be batched together; techniques like KV caching, continuous batching, and streaming responses are what make it usable at scale.",
      "Open-source inference engines optimise throughput and memory so capable models run on the hardware you have. Quantization is often paired with inference to fit a model onto a single GPU or a laptop.",
    ],
    related: { label: "Best local LLM tools", href: "/best/local-llm-tools" },
    categoryIds: ["local-llm", "ai-ml"],
    keywords: ["inference", "serving"],
  },
  {
    slug: "quantization",
    term: "quantization",
    short:
      "Quantization shrinks a model by storing its weights at lower numeric precision — for example 4-bit instead of 16-bit — cutting memory and speeding inference with a small quality trade-off.",
    body: [
      "Quantization is what lets large open models run on modest hardware. By representing weights with fewer bits, a model that needed a server can fit on a consumer GPU or a laptop. Formats like GGUF, GPTQ, and AWQ package quantized weights for different runtimes.",
      "The trade-off is size and speed versus accuracy: aggressive quantization saves the most memory but can degrade quality, so runtimes offer several levels. It is a core enabling technique for the local-LLM ecosystem.",
    ],
    related: { label: "Best local LLM tools", href: "/best/local-llm-tools" },
    categoryIds: ["local-llm"],
    keywords: ["quantiz", "gguf"],
  },
  {
    slug: "context-window",
    term: "context window",
    short:
      "A context window is the maximum amount of text — measured in tokens — a language model can consider at once, covering both your input and its generated output.",
    body: [
      "Everything the model 'sees' for a request must fit in the context window: the system prompt, conversation history, any retrieved documents, and the answer it writes. Larger windows allow whole documents or codebases as input, but they cost more and can dilute the model's attention across irrelevant text.",
      "Context windows have grown quickly, yet retrieval-augmented generation is still widely used to keep prompts relevant and cheap even when a large window is available — feeding only the most pertinent chunks rather than everything.",
    ],
    related: { label: "Best open-source LLMs", href: "/best/open-source-llms" },
    categoryIds: ["ai-ml"],
    keywords: [],
  },
  {
    slug: "token",
    term: "token (LLM)",
    short:
      "A token is the unit of text a language model processes — roughly a word-piece — and the thing models are billed by and limited to.",
    body: [
      "A tokenizer splits text into sub-word units before the model sees it; in English a token averages about four characters. Both context windows and API pricing are measured in tokens, so token efficiency directly affects cost and how much you can fit in a prompt.",
      "Different models use different tokenizers, which changes how efficiently they handle code and non-English languages. Open models ship their own tokenizer so you can measure token counts exactly.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml"],
    keywords: [],
  },
  {
    slug: "multi-agent-system",
    term: "multi-agent system",
    short:
      "A multi-agent system coordinates several AI agents — often with specialised roles — that communicate and divide a task, rather than relying on one agent to do everything.",
    body: [
      "Splitting work across agents lets each focus on a narrower job — a planner, a coder, a reviewer — and tackle problems too complex for a single loop. Common patterns include an orchestrator delegating to workers, agents debating to improve answers, and pipelines where each stage is its own agent.",
      "Open-source frameworks supply the messaging, shared memory, and orchestration. The hard parts are coordination overhead and cost control, since every agent step is another model call.",
    ],
    related: { label: "Trending AI agents", href: "/categories/ai-agents" },
    categoryIds: ["ai-agents"],
    keywords: ["multi-agent", "multi agent"],
  },
  {
    slug: "function-calling",
    term: "function calling (tool calling)",
    short:
      "Function calling lets a language model invoke external tools or APIs by emitting a structured request your code runs and feeds back — the mechanism behind tool-using agents.",
    body: [
      "Given a set of tool definitions, the model can respond with a structured call — a function name and arguments matching a schema — instead of plain text. Your code executes it and returns the result, which the model uses to continue. This loop is what turns a chatbot into an agent that can act.",
      "How reliably a model and framework handle tool calling is a major differentiator between agent stacks. Open standards like the Model Context Protocol standardise the tools themselves so they are reusable across clients.",
    ],
    related: { label: "Trending AI agents", href: "/categories/ai-agents" },
    categoryIds: ["ai-agents", "mcp"],
    keywords: ["function call", "tool call", "tool-use"],
  },
  {
    slug: "agentic-workflow",
    term: "agentic workflow",
    short:
      "An agentic workflow is an automation where an AI agent — not a fixed script — decides the steps: planning, calling tools, checking results, and adapting until a goal is met.",
    body: [
      "Unlike a deterministic pipeline, an agentic workflow lets the model choose what to do next based on intermediate results. That flexibility suits open-ended tasks like research, code changes, or operations, at the cost of being harder to predict and test.",
      "Production agentic workflows add guardrails, human-in-the-loop checkpoints, and observability so the autonomy stays safe and debuggable. Open-source frameworks increasingly ship these controls by default.",
    ],
    related: { label: "Best open-source AI agents", href: "/best/ai-agents" },
    categoryIds: ["ai-agents"],
    keywords: ["agentic", "workflow"],
  },
  {
    slug: "semantic-search",
    term: "semantic search",
    short:
      "Semantic search finds results by meaning rather than exact keywords, comparing embeddings of the query and documents to surface conceptually similar matches.",
    body: [
      "Instead of matching literal words, semantic search embeds the query and the corpus into vectors and returns the nearest neighbours. That handles synonyms and paraphrase, and is the retrieval step behind most RAG systems.",
      "In practice it is often combined with traditional keyword search — a hybrid approach — to get both conceptual recall and exact-term precision. Open-source vector databases provide the index that makes it fast.",
    ],
    related: { label: "Best vector databases", href: "/best/vector-databases" },
    categoryIds: ["databases", "ai-ml"],
    keywords: ["semantic", "search", "vector"],
  },
  {
    slug: "ai-hallucination",
    term: "AI hallucination",
    short:
      "An AI hallucination is when a language model produces fluent but false or fabricated information, stating it with the same confidence as fact.",
    body: [
      "Because a language model predicts plausible text rather than verifying truth, it can invent citations, APIs, or facts — especially for niche, recent, or under-represented topics. For production systems this is a primary reliability risk.",
      "Mitigations all aim to ground or check the output: retrieval-augmented generation with citations, output validation and guardrails, and systematic evaluation. Open-source tooling exists for each, and no single fix eliminates the problem entirely.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml"],
    keywords: [],
  },
  {
    slug: "ai-guardrails",
    term: "AI guardrails",
    short:
      "AI guardrails are the checks around a language model that constrain its inputs and outputs — blocking unsafe content, enforcing formats, and catching hallucinations.",
    body: [
      "Guardrails sit between your application and the model, validating what goes in and what comes out: filtering unsafe or off-topic requests, redacting sensitive data, enforcing a required output schema, and retrying when a response violates a policy.",
      "Open-source guardrail libraries package these validators and policies so teams can ship agents and assistants without hand-rolling safety checks. They are a practical requirement for anything user-facing.",
    ],
    related: { label: "Trending security projects", href: "/categories/security" },
    categoryIds: ["security", "ai-ml"],
    keywords: [],
  },
  {
    slug: "small-language-model",
    term: "small language model (SLM)",
    short:
      "A small language model is a compact LLM — typically a few billion parameters or fewer — designed to run cheaply on local or edge hardware while staying capable for focused tasks.",
    body: [
      "Small language models trade the broad capability of frontier models for speed, low cost, and the ability to run privately on a laptop, phone, or edge device. For a narrow, well-defined task a fine-tuned small model often matches or beats a much larger general one.",
      "Open SLMs combined with quantization have made capable on-device inference mainstream, which is why they anchor much of the local-LLM ecosystem.",
    ],
    related: { label: "Best local LLM tools", href: "/best/local-llm-tools" },
    categoryIds: ["local-llm", "ai-ml"],
    keywords: ["slm", "small"],
  },
  {
    slug: "multimodal-model",
    term: "multimodal model",
    short:
      "A multimodal model understands or generates more than one type of data — such as text plus images, audio, or video — within a single model.",
    body: [
      "By representing different modalities in a shared space, a multimodal model can read a screenshot, describe an image, or reason over a chart alongside text. Vision-language models in particular power document understanding and AI agents that operate software from what they see.",
      "Open multimodal models bring these capabilities into self-hostable stacks, behind use cases from image generation to UI automation.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml"],
    keywords: ["multimodal", "vision"],
  },
  {
    slug: "lora",
    term: "LoRA (Low-Rank Adaptation)",
    short:
      "LoRA is a parameter-efficient fine-tuning method that trains small adapter matrices instead of the full model, cutting the cost of customising an LLM dramatically.",
    body: [
      "LoRA freezes the base model's weights and learns small low-rank update matrices, so the trained artifact is tiny and can be swapped or stacked on top of the base. This brought fine-tuning within reach of a single GPU and made custom models practical for small teams.",
      "Open-source toolchains support LoRA out of the box, and QLoRA adds quantization so even large base models can be adapted on modest hardware.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml"],
    keywords: ["lora", "fine-tun"],
  },
  {
    slug: "mixture-of-experts",
    term: "mixture of experts (MoE)",
    short:
      "Mixture of experts is a model design that routes each token through only a few of many specialised sub-networks, giving large total capacity at a fraction of the compute per token.",
    body: [
      "An MoE model contains many 'expert' sub-networks but activates only a small subset for any given token, chosen by a learned router. This sparse activation yields the quality of a very large model while keeping the cost per token closer to a small one.",
      "Several leading open models use the MoE design. Serving them efficiently requires routing-aware inference, since the active experts change token by token.",
    ],
    related: { label: "Best open-source LLMs", href: "/best/open-source-llms" },
    categoryIds: ["ai-ml"],
    keywords: ["mixture of experts", "moe"],
  },
  {
    slug: "self-hosting",
    term: "self-hosting",
    short:
      "Self-hosting means running software on infrastructure you control instead of a vendor's cloud — for privacy, cost control, customisation, and no per-use fees.",
    body: [
      "Self-hosting puts the application on your own server, VPS, or homelab. You trade some convenience for data ownership and control, which is why it is especially popular for AI tools, developer infrastructure, and productivity apps that would otherwise send your data to a third party.",
      "A large open-source ecosystem exists specifically to be self-hosted, and one-command deployment stacks have made running your own services far more accessible than it used to be.",
    ],
    related: { label: "Best self-hosted AI tools", href: "/best/self-hosted-ai" },
    categoryIds: ["infrastructure", "ai-agents"],
    keywords: ["self-host", "self host"],
  },
  {
    slug: "observability",
    term: "observability",
    short:
      "Observability is the ability to understand a system's internal state from its outputs — logs, metrics, and traces — so you can debug and monitor it in production.",
    body: [
      "Observability rests on three signals: logs (discrete events), metrics (aggregated numbers), and traces (the path of a request across services). For distributed and AI systems it increasingly also covers token usage and output quality. The principle is simple: you cannot fix what you cannot see.",
      "Open-source observability stacks instrument applications and, more and more, the LLM calls and agents inside them — turning opaque AI behaviour into something you can measure and debug.",
    ],
    related: { label: "Trending infrastructure projects", href: "/categories/infrastructure" },
    categoryIds: ["infrastructure", "devtools"],
    keywords: ["observab", "telemetry", "tracing"],
  },
  {
    slug: "webassembly",
    term: "WebAssembly (Wasm)",
    short:
      "WebAssembly is a portable binary format that runs near-native-speed code in the browser and beyond, letting languages like Rust, Go, and C target the web and the edge.",
    body: [
      "Wasm is a fast, sandboxed, language-agnostic compile target. In the browser it powers heavy in-page tools; outside it, Wasm runtimes execute the same modules server-side, in plugin systems, and at the edge — even for local model inference.",
      "Open-source Wasm runtimes and toolchains have pushed it well past its browser origins into a general portable execution layer.",
    ],
    related: { label: "Best open-source developer tools", href: "/best/developer-tools" },
    categoryIds: ["devtools", "web-frameworks"],
    keywords: ["wasm", "webassembly"],
  },
  {
    slug: "reranking",
    term: "reranking",
    short:
      "Reranking reorders an initial set of retrieval results with a more accurate — and costlier — model, putting the most relevant items on top.",
    body: [
      "Retrieval is usually two stages: a fast retriever pulls a broad candidate set, then a reranker scores each candidate against the query with a more precise model and reorders them. This sharply improves the quality of the context fed into a RAG system, which directly improves its answers.",
      "Open-source cross-encoder rerankers drop into existing vector-search pipelines as that second stage.",
    ],
    related: { label: "Best vector databases", href: "/best/vector-databases" },
    categoryIds: ["databases", "ai-ml"],
    keywords: ["rerank", "retrieval"],
  },
  {
    slug: "knowledge-graph",
    term: "knowledge graph",
    short:
      "A knowledge graph stores information as entities and the relationships between them, letting you query connected facts rather than isolated rows or documents.",
    body: [
      "By modelling the real world as nodes (entities) and edges (relationships), a knowledge graph answers questions about how things connect — which powers recommendations, fraud detection, and search. It is increasingly used to ground language models, an approach often called GraphRAG.",
      "Open-source graph databases and tooling build and query these structures at scale, with query languages designed for traversing relationships.",
    ],
    related: { label: "Trending databases", href: "/categories/databases" },
    categoryIds: ["databases"],
    keywords: ["graph", "knowledge"],
  },
  {
    slug: "diffusion-model",
    term: "diffusion model",
    short:
      "A diffusion model generates images, audio, or video by starting from random noise and iteratively denoising it toward a sample that matches a prompt.",
    body: [
      "A diffusion model is trained to reverse a process that gradually adds noise to data. At generation time it starts from pure noise and removes it step by step, usually guided by a text embedding, until a coherent sample emerges. This is the technique behind most modern open image and video generators.",
      "Open-source diffusion ecosystems provide model weights, community fine-tunes, and pipelines you can run on your own GPU.",
    ],
    related: { label: "Trending AI & ML projects", href: "/categories/ai-ml" },
    categoryIds: ["ai-ml"],
    keywords: ["diffusion", "image generation"],
  },
];

export const GLOSSARY_SLUGS: string[] = GLOSSARY.map((t) => t.slug);

export function getGlossaryTerm(slug: string): GlossaryTerm | null {
  return GLOSSARY.find((t) => t.slug === slug) ?? null;
}

function matches(repo: Repo, term: GlossaryTerm): boolean {
  const catOk = term.categoryIds.length === 0 || term.categoryIds.includes(repo.categoryId);
  if (!catOk) return false;
  if (term.keywords.length === 0) return true;
  const hay = `${repo.name} ${repo.fullName} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
  return term.keywords.some((k) => hay.includes(k));
}

/** Top trending repos illustrating the term. Caller awaits refresh hooks. */
export function getGlossaryRepos(term: GlossaryTerm, limit = 8): Repo[] {
  const picked = getDerivedRepos().filter((r) => matches(r, term));
  picked.sort((a, b) => {
    if (b.momentumScore !== a.momentumScore) return b.momentumScore - a.momentumScore;
    return a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase());
  });
  return picked.slice(0, limit);
}

export function buildGlossaryFaq(term: GlossaryTerm): FaqEntry[] {
  const out: FaqEntry[] = [{ q: `What is ${term.term}?`, a: `${term.short} ${term.body[0] ?? ""}`.trim() }];
  if (term.faq) out.push(...term.faq);
  return out;
}
