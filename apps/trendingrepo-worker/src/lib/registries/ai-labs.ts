// AI lab registry. Shared between:
//   - fetchers/arxiv     - lab-detect.ts substring matches
//   - fetchers/ai-blogs  - blog_rss_url is the feed source

export type LabCategory = 'industry' | 'academic' | 'national_lab' | 'institute';
export type LabBoost = 1.15 | 1.1 | 1.0;

export interface AiLab {
  lab_id: string;
  name: string;
  category: LabCategory;
  country: string;
  official_url: string;
  blog_url: string | null;
  blog_rss_url: string | null;
  affiliation_patterns: string[];
  boost: LabBoost;
  verified: boolean;
}

export const AI_LAB_REGISTRY: Readonly<Record<string, AiLab>> = Object.freeze({
  openai: {
    lab_id: 'openai', name: 'OpenAI', category: 'industry', country: 'US',
    official_url: 'https://openai.com', blog_url: 'https://openai.com/news/',
    blog_rss_url: 'https://openai.com/news/rss.xml',
    affiliation_patterns: ['OpenAI', 'openai.com'], boost: 1.15, verified: true,
  },
  anthropic: {
    lab_id: 'anthropic', name: 'Anthropic', category: 'industry', country: 'US',
    official_url: 'https://www.anthropic.com', blog_url: 'https://www.anthropic.com/news',
    blog_rss_url: null,
    affiliation_patterns: ['Anthropic', 'anthropic.com'], boost: 1.15, verified: true,
  },
  deepmind: {
    lab_id: 'deepmind', name: 'Google DeepMind', category: 'industry', country: 'UK',
    official_url: 'https://deepmind.google', blog_url: 'https://deepmind.google/discover/blog/',
    blog_rss_url: 'https://deepmind.google/blog/rss.xml',
    affiliation_patterns: ['DeepMind', 'Google DeepMind', 'deepmind.com', 'deepmind.google'],
    boost: 1.15, verified: true,
  },
  'google-research': {
    lab_id: 'google-research', name: 'Google Research', category: 'industry', country: 'US',
    official_url: 'https://research.google', blog_url: 'https://research.google/blog/',
    blog_rss_url: 'https://research.google/blog/rss/',
    affiliation_patterns: ['Google Research', 'research.google', 'Google AI', 'Google Brain'],
    boost: 1.15, verified: true,
  },
  'meta-fair': {
    lab_id: 'meta-fair', name: 'Meta FAIR', category: 'industry', country: 'US',
    official_url: 'https://ai.meta.com', blog_url: 'https://ai.meta.com/blog/',
    blog_rss_url: null,
    affiliation_patterns: ['Meta AI', 'FAIR', 'Facebook AI Research', 'ai.meta.com', '@meta.com', '@fb.com'],
    boost: 1.15, verified: true,
  },
  'microsoft-research': {
    lab_id: 'microsoft-research', name: 'Microsoft Research', category: 'industry', country: 'US',
    official_url: 'https://www.microsoft.com/en-us/research/', blog_url: 'https://www.microsoft.com/en-us/research/blog/',
    blog_rss_url: 'https://www.microsoft.com/en-us/research/feed/',
    affiliation_patterns: ['Microsoft Research', 'MSR', '@microsoft.com'],
    boost: 1.15, verified: true,
  },
  huggingface: {
    lab_id: 'huggingface', name: 'Hugging Face', category: 'industry', country: 'US',
    official_url: 'https://huggingface.co', blog_url: 'https://huggingface.co/blog',
    blog_rss_url: 'https://huggingface.co/blog/feed.xml',
    affiliation_patterns: ['Hugging Face', 'huggingface.co'], boost: 1.1, verified: true,
  },
  'allen-ai': {
    lab_id: 'allen-ai', name: 'Allen Institute for AI (Ai2)', category: 'institute', country: 'US',
    official_url: 'https://allenai.org', blog_url: 'https://allenai.org/blog',
    blog_rss_url: 'https://allenai.org/rss.xml',
    affiliation_patterns: ['Allen Institute', 'Ai2', 'AI2', 'allenai.org'], boost: 1.1, verified: true,
  },
  mistral: {
    lab_id: 'mistral', name: 'Mistral AI', category: 'industry', country: 'FR',
    official_url: 'https://mistral.ai', blog_url: 'https://mistral.ai/news', blog_rss_url: null,
    affiliation_patterns: ['Mistral AI', 'mistral.ai'], boost: 1.1, verified: true,
  },
  'nvidia-research': {
    lab_id: 'nvidia-research', name: 'NVIDIA Research', category: 'industry', country: 'US',
    official_url: 'https://research.nvidia.com', blog_url: 'https://blogs.nvidia.com/blog/category/deep-learning/',
    blog_rss_url: 'https://blogs.nvidia.com/feed/',
    affiliation_patterns: ['NVIDIA Research', 'NVIDIA AI', '@nvidia.com'], boost: 1.1, verified: true,
  },
  'apple-ml': {
    lab_id: 'apple-ml', name: 'Apple Machine Learning Research', category: 'industry', country: 'US',
    official_url: 'https://machinelearning.apple.com', blog_url: 'https://machinelearning.apple.com',
    blog_rss_url: 'https://machinelearning.apple.com/rss.xml',
    affiliation_patterns: ['machinelearning.apple.com', 'Apple ML Research', '@apple.com'], boost: 1.1, verified: true,
  },
  ai21: {
    lab_id: 'ai21', name: 'AI21 Labs', category: 'industry', country: 'IL',
    official_url: 'https://www.ai21.com', blog_url: 'https://www.ai21.com/blog', blog_rss_url: null,
    affiliation_patterns: ['AI21 Labs', 'AI21', 'ai21.com'], boost: 1.1, verified: true,
  },
  cohere: {
    lab_id: 'cohere', name: 'Cohere', category: 'industry', country: 'CA',
    official_url: 'https://cohere.com', blog_url: 'https://cohere.com/blog', blog_rss_url: null,
    affiliation_patterns: ['Cohere', 'cohere.com', 'cohere.ai'], boost: 1.1, verified: true,
  },
  'stability-ai': {
    lab_id: 'stability-ai', name: 'Stability AI', category: 'industry', country: 'UK',
    official_url: 'https://stability.ai', blog_url: 'https://stability.ai/news',
    blog_rss_url: 'https://stability.ai/news-updates?format=rss',
    affiliation_patterns: ['Stability AI', 'stability.ai'], boost: 1.1, verified: true,
  },
  'together-ai': {
    lab_id: 'together-ai', name: 'Together AI', category: 'industry', country: 'US',
    official_url: 'https://www.together.ai', blog_url: 'https://www.together.ai/blog',
    blog_rss_url: 'https://www.together.ai/blog/rss.xml',
    affiliation_patterns: ['Together AI', 'Together Computer', 'together.ai'], boost: 1.1, verified: true,
  },
  'reka-ai': {
    lab_id: 'reka-ai', name: 'Reka AI', category: 'industry', country: 'US',
    official_url: 'https://www.reka.ai', blog_url: 'https://reka.ai/news', blog_rss_url: null,
    affiliation_patterns: ['Reka AI', 'reka.ai'], boost: 1.1, verified: true,
  },
  xai: {
    lab_id: 'xai', name: 'xAI', category: 'industry', country: 'US',
    official_url: 'https://x.ai', blog_url: 'https://x.ai/news', blog_rss_url: null,
    affiliation_patterns: ['xAI', 'xAI Corp', 'x.ai'], boost: 1.1, verified: true,
  },
  deepseek: {
    lab_id: 'deepseek', name: 'DeepSeek', category: 'industry', country: 'CN',
    official_url: 'https://www.deepseek.com', blog_url: 'https://www.deepseek.com', blog_rss_url: null,
    affiliation_patterns: ['DeepSeek', 'DeepSeek-AI', 'deepseek.com'], boost: 1.1, verified: true,
  },
  qwen: {
    lab_id: 'qwen', name: 'Qwen / Alibaba DAMO', category: 'industry', country: 'CN',
    official_url: 'https://qwenlm.github.io', blog_url: 'https://qwenlm.github.io/blog/',
    blog_rss_url: 'https://qwenlm.github.io/blog/index.xml',
    affiliation_patterns: ['Qwen', 'Alibaba DAMO', 'Alibaba Cloud', 'DAMO Academy', '@alibaba-inc.com'],
    boost: 1.1, verified: true,
  },
  'moonshot-ai': {
    lab_id: 'moonshot-ai', name: 'Moonshot AI (Kimi)', category: 'industry', country: 'CN',
    official_url: 'https://www.moonshot.cn', blog_url: 'https://www.moonshot.cn', blog_rss_url: null,
    affiliation_patterns: ['Moonshot AI', 'Kimi', 'moonshot.cn'], boost: 1.1, verified: true,
  },
  'bair-berkeley': {
    lab_id: 'bair-berkeley', name: 'Berkeley AI Research (BAIR)', category: 'academic', country: 'US',
    official_url: 'https://bair.berkeley.edu', blog_url: 'https://bair.berkeley.edu/blog/',
    blog_rss_url: 'https://bair.berkeley.edu/blog/feed.xml',
    affiliation_patterns: ['UC Berkeley', 'Berkeley AI Research', 'BAIR', 'bair.berkeley.edu', '@berkeley.edu'],
    boost: 1.1, verified: true,
  },
  'mit-csail': {
    lab_id: 'mit-csail', name: 'MIT CSAIL', category: 'academic', country: 'US',
    official_url: 'https://www.csail.mit.edu', blog_url: 'https://www.csail.mit.edu/news',
    blog_rss_url: 'https://www.csail.mit.edu/rss.xml',
    affiliation_patterns: ['MIT CSAIL', 'csail.mit.edu', '@mit.edu'], boost: 1.1, verified: true,
  },
  'stanford-nlp': {
    lab_id: 'stanford-nlp', name: 'Stanford NLP / HAI', category: 'academic', country: 'US',
    official_url: 'https://hai.stanford.edu', blog_url: 'https://hai.stanford.edu/news', blog_rss_url: null,
    affiliation_patterns: ['Stanford NLP', 'Stanford HAI', 'hai.stanford.edu', '@stanford.edu'],
    boost: 1.1, verified: true,
  },
  'stanford-ai-lab': {
    lab_id: 'stanford-ai-lab', name: 'Stanford AI Lab (SAIL)', category: 'academic', country: 'US',
    official_url: 'https://ai.stanford.edu', blog_url: 'https://ai.stanford.edu/blog/',
    blog_rss_url: 'https://ai.stanford.edu/blog/feed.xml',
    affiliation_patterns: ['Stanford AI Lab', 'SAIL', 'ai.stanford.edu'], boost: 1.1, verified: true,
  },
  mila: {
    lab_id: 'mila', name: 'Mila — Quebec AI Institute', category: 'institute', country: 'CA',
    official_url: 'https://mila.quebec', blog_url: 'https://mila.quebec/en/news',
    blog_rss_url: 'https://mila.quebec/en/rss.xml',
    affiliation_patterns: ['Mila', 'Quebec AI Institute', 'mila.quebec', 'Universite de Montreal'],
    boost: 1.1, verified: true,
  },
  'cmu-ml-blog': {
    lab_id: 'cmu-ml-blog', name: 'CMU Machine Learning Blog', category: 'academic', country: 'US',
    official_url: 'https://blog.ml.cmu.edu', blog_url: 'https://blog.ml.cmu.edu',
    blog_rss_url: 'https://blog.ml.cmu.edu/feed/',
    affiliation_patterns: ['Carnegie Mellon', 'CMU', '@cmu.edu', 'blog.ml.cmu.edu'],
    boost: 1.1, verified: true,
  },
});

export const AI_LAB_LIST: readonly AiLab[] = Object.freeze(
  Object.values(AI_LAB_REGISTRY),
) as readonly AiLab[];

export function getLab(labId: string): AiLab | null {
  return AI_LAB_REGISTRY[labId] ?? null;
}

export function listLabs(): readonly AiLab[] {
  return AI_LAB_LIST;
}

export function isFrontierLab(labId: string): boolean {
  return AI_LAB_REGISTRY[labId]?.boost === 1.15;
}

export function isStrongLab(labId: string): boolean {
  return AI_LAB_REGISTRY[labId]?.boost === 1.1;
}
