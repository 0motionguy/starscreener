import { describe, expect, it } from 'vitest';
import {
  filterLlmModels,
  isLlmModel,
  LLM_PIPELINE_TAGS,
  type HuggingFaceModel,
} from '../index.js';

describe('huggingface pipeline_tag LLM filter (A10)', () => {
  it('mixed input → keeps only text-generation and conversational models', () => {
    const models: HuggingFaceModel[] = [
      { id: 'a/text-gen-model', pipeline_tag: 'text-generation' },
      { id: 'b/conv-model', pipeline_tag: 'conversational' },
      { id: 'c/sentence-sim', pipeline_tag: 'sentence-similarity' },
      { id: 'd/image-class', pipeline_tag: 'image-classification' },
      { id: 'e/null-tag', pipeline_tag: null },
    ];

    const kept = filterLlmModels(models);

    expect(kept).toHaveLength(2);
    expect(kept.map((m) => m.id)).toEqual(['a/text-gen-model', 'b/conv-model']);
  });

  it('all-LLM input → all retained', () => {
    const models: HuggingFaceModel[] = [
      { id: 'meta/llama-3', pipeline_tag: 'text-generation' },
      { id: 'mistralai/mistral-7b', pipeline_tag: 'text-generation' },
      { id: 'anthropic/claude-conv', pipeline_tag: 'conversational' },
      { id: 'openai/gpt-conv', pipeline_tag: 'conversational' },
    ];

    const kept = filterLlmModels(models);

    expect(kept).toHaveLength(4);
    expect(kept).toEqual(models);
  });

  it('all-null / empty pipeline_tag input → all excluded, returns empty array', () => {
    const models: HuggingFaceModel[] = [
      { id: 'x/no-tag-1', pipeline_tag: null },
      { id: 'x/no-tag-2', pipeline_tag: undefined },
      { id: 'x/no-tag-3' }, // pipeline_tag missing entirely
    ];

    const kept = filterLlmModels(models);

    // Mirrors the stub fetcher's current "empty payload" path: zero items
    // through the filter means zero items downstream, no Redis write needed.
    expect(kept).toEqual([]);
  });

  describe('isLlmModel predicate', () => {
    it('accepts text-generation', () => {
      expect(isLlmModel({ pipeline_tag: 'text-generation' })).toBe(true);
    });

    it('accepts conversational', () => {
      expect(isLlmModel({ pipeline_tag: 'conversational' })).toBe(true);
    });

    it('rejects other pipeline_tags', () => {
      const rejected = [
        'sentence-similarity',
        'image-classification',
        'automatic-speech-recognition',
        'feature-extraction',
        'translation',
        'summarization',
        'question-answering',
      ];
      for (const tag of rejected) {
        expect(isLlmModel({ pipeline_tag: tag })).toBe(false);
      }
    });

    it('rejects null, undefined, and missing pipeline_tag', () => {
      expect(isLlmModel({ pipeline_tag: null })).toBe(false);
      expect(isLlmModel({ pipeline_tag: undefined })).toBe(false);
      expect(isLlmModel({})).toBe(false);
    });

    it('rejects non-string pipeline_tag values', () => {
      // Defensive: HF API contract says string|null but we guard anyway.
      expect(isLlmModel({ pipeline_tag: 123 as unknown as string })).toBe(false);
      expect(isLlmModel({ pipeline_tag: ['text-generation'] as unknown as string })).toBe(false);
    });
  });

  it('LLM_PIPELINE_TAGS exposes exactly the two allowed tags', () => {
    expect(LLM_PIPELINE_TAGS.size).toBe(2);
    expect(LLM_PIPELINE_TAGS.has('text-generation')).toBe(true);
    expect(LLM_PIPELINE_TAGS.has('conversational')).toBe(true);
  });
});
