// Pure-regex tagger over title + abstract.

import type { ArxivPaper } from './types.js';

const CATEGORY_TAGS: Readonly<Record<string, string>> = Object.freeze({
  'cs.AI': 'tag:ai',
  'cs.CL': 'tag:nlp',
  'cs.LG': 'tag:ml',
  'cs.MA': 'tag:multi-agent',
  'cs.CV': 'tag:vision',
  'cs.RO': 'tag:robotics',
  'cs.IR': 'tag:retrieval',
  'cs.HC': 'tag:hci',
  'stat.ML': 'tag:ml',
});

interface TagPattern { re: RegExp; tag: string; }

const MODEL_PATTERNS: TagPattern[] = [
  { re: /\bGPT[-\s]?[3-5](?:\.5)?\b/i, tag: 'model:gpt' },
  { re: /\bGPT[-\s]?o\d?\b/i, tag: 'model:gpt-o' },
  { re: /\bClaude(?:\s|-)?(?:opus|sonnet|haiku|\d+(?:\.\d+)?)\b/i, tag: 'model:claude' },
  { re: /\bLLaMA[-\s]?\d?\b|\bLlama[-\s]?\d?\b/i, tag: 'model:llama' },
  { re: /\bMistral\b|\bMixtral\b/i, tag: 'model:mistral' },
  { re: /\bGemini\b|\bGemma\b/i, tag: 'model:gemini' },
  { re: /\bPaLM[-\s]?\d?\b/i, tag: 'model:palm' },
  { re: /\bQwen[-\s]?\d?\b/i, tag: 'model:qwen' },
  { re: /\bDeepSeek(?:[-\s]?(?:V\d|R\d|coder|math))?\b/i, tag: 'model:deepseek' },
  { re: /\bPhi[-\s]?\d\b/i, tag: 'model:phi' },
  { re: /\bFalcon[-\s]?\d?\b/i, tag: 'model:falcon' },
  { re: /\bGrok[-\s]?\d?\b/i, tag: 'model:grok' },
  { re: /\bKimi\b/i, tag: 'model:kimi' },
  { re: /\bMixture[-\s]of[-\s]Experts?\b|\bMoE\b/i, tag: 'arch:moe' },
  { re: /\bMamba\b/i, tag: 'arch:mamba' },
  { re: /\bdiffusion[-\s](?:model|process|polic\w*|based|prior|sampling|denoising)\b/i, tag: 'tech:diffusion' },
  { re: /\bRLHF\b/i, tag: 'tech:rlhf' },
  { re: /\bDPO\b/i, tag: 'tech:dpo' },
  { re: /\bSFT\b/i, tag: 'tech:sft' },
  { re: /\bLoRA\b|\bQLoRA\b/i, tag: 'tech:lora' },
  { re: /\bquantiz(?:ation|ed)\b/i, tag: 'tech:quantization' },
  { re: /\bdistill(?:ation|ed)\b/i, tag: 'tech:distillation' },
  { re: /\bin[-\s]context\s+learning\b|\bICL\b/i, tag: 'tech:icl' },
  { re: /\bchain[-\s]of[-\s]thought\b|\bCoT\b/i, tag: 'tech:cot' },
  { re: /\bretrieval[-\s]augmented\b|\bRAG\b/i, tag: 'tech:rag' },
  { re: /\bfine[-\s]?tun(?:ing|ed)\b/i, tag: 'tech:finetuning' },
  { re: /\bagent(?:ic)?\s+(?:framework|workflow|system)s?\b/i, tag: 'tech:agentic' },
  { re: /\btool[-\s]use\b|\bfunction[-\s]calling\b/i, tag: 'tech:tool-use' },
  { re: /\bMulti[-\s]?Agent\b/i, tag: 'tech:multi-agent' },
  { re: /\bworld\s+model\b/i, tag: 'tech:world-model' },
  { re: /\bself[-\s]play\b/i, tag: 'tech:self-play' },
  { re: /\bvision[-\s]language\b|\bVLM\b/i, tag: 'modality:vlm' },
  { re: /\bmultimodal\b/i, tag: 'modality:multimodal' },
  { re: /\bspeech\s+(?:recognition|model)\b|\bASR\b|\bTTS\b/i, tag: 'modality:speech' },
  { re: /\bcode\s+(?:generation|completion|llm)\b|\bcoding\s+agent\b/i, tag: 'modality:code' },
  { re: /\bbenchmark\b/i, tag: 'eval:benchmark' },
  { re: /\bjailbreak\b/i, tag: 'safety:jailbreak' },
  { re: /\balignment\b/i, tag: 'safety:alignment' },
  { re: /\binterpretability\b/i, tag: 'safety:interpretability' },
];

export function extractTags(paper: ArxivPaper): string[] {
  const tags = new Set<string>();
  for (const cat of paper.categories) {
    const t = CATEGORY_TAGS[cat];
    if (t) tags.add(t);
  }
  const haystack = `${paper.title}\n${paper.abstract}`;
  for (const pattern of MODEL_PATTERNS) {
    if (pattern.re.test(haystack)) tags.add(pattern.tag);
  }
  return Array.from(tags).sort();
}
