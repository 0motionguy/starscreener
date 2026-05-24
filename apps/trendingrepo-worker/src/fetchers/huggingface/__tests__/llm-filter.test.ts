import { describe, expect, it } from 'vitest';
import {
  filterLlmModels,
  isLlmModel,
  LLM_PIPELINE_TAGS,
  type HuggingFaceModel,
} from '../index.js';

describe('huggingface pipeline_tag LLM filter (A10)', () => {
  it('mixed input → keeps text-gen, conversational, and multimodal LLMs', () => {
    const models: HuggingFaceModel[] = [
      { id: 'a/text-gen-model', pipeline_tag: 'text-generation' },
      { id: 'b/conv-model', pipeline_tag: 'conversational' },
      { id: 'c/multimodal-vl', pipeline_tag: 'image-text-to-text' },
      { id: 'd/any-to-any', pipeline_tag: 'any-to-any' },
      { id: 'e/video-llm', pipeline_tag: 'video-text-to-text' },
      { id: 'f/sentence-sim', pipeline_tag: 'sentence-similarity' },
      { id: 'g/image-class', pipeline_tag: 'image-classification' },
      { id: 'h/text-to-image', pipeline_tag: 'text-to-image' },
      { id: 'i/text-to-speech', pipeline_tag: 'text-to-speech' },
      { id: 'j/null-tag', pipeline_tag: null },
    ];

    const kept = filterLlmModels(models);

    expect(kept).toHaveLength(5);
    expect(kept.map((m) => m.id)).toEqual([
      'a/text-gen-model',
      'b/conv-model',
      'c/multimodal-vl',
      'd/any-to-any',
      'e/video-llm',
    ]);
  });

  it('all-LLM input → all retained (across the broadened tag set)', () => {
    const models: HuggingFaceModel[] = [
      { id: 'meta/llama-3', pipeline_tag: 'text-generation' },
      { id: 'mistralai/mistral-7b', pipeline_tag: 'text-generation' },
      { id: 'anthropic/claude-conv', pipeline_tag: 'conversational' },
      { id: 'qwen/qwen-vl', pipeline_tag: 'image-text-to-text' },
      { id: 'google/gemini-any', pipeline_tag: 'any-to-any' },
    ];

    const kept = filterLlmModels(models);

    expect(kept).toHaveLength(5);
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

    it('accepts multimodal LLMs (image-text-to-text, any-to-any, video-text-to-text)', () => {
      expect(isLlmModel({ pipeline_tag: 'image-text-to-text' })).toBe(true);
      expect(isLlmModel({ pipeline_tag: 'any-to-any' })).toBe(true);
      expect(isLlmModel({ pipeline_tag: 'video-text-to-text' })).toBe(true);
    });

    it('rejects non-LLM pipeline_tags', () => {
      const rejected = [
        'sentence-similarity',
        'image-classification',
        'automatic-speech-recognition',
        'feature-extraction',
        'translation',
        'summarization',
        'question-answering',
        'text-to-image',
        'text-to-speech',
        'text-to-video',
        'image-to-video',
        'image-to-image',
        'image-to-3d',
        'mask-generation',
        'token-classification',
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

  it('LLM_PIPELINE_TAGS exposes the broadened LLM tag set', () => {
    expect(LLM_PIPELINE_TAGS.size).toBe(5);
    expect(LLM_PIPELINE_TAGS.has('text-generation')).toBe(true);
    expect(LLM_PIPELINE_TAGS.has('conversational')).toBe(true);
    expect(LLM_PIPELINE_TAGS.has('image-text-to-text')).toBe(true);
    expect(LLM_PIPELINE_TAGS.has('any-to-any')).toBe(true);
    expect(LLM_PIPELINE_TAGS.has('video-text-to-text')).toBe(true);
  });
});
