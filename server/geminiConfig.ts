import { AIError } from './aiSecurity.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export type GeminiModel = typeof DEFAULT_GEMINI_MODEL | 'gemini-2.5-flash';
export type GeminiMode = 'chat' | 'estimate' | 'transcribe';

interface GeminiConfig {
  model: GeminiModel;
  url: string;
  generationConfig: {
    responseMimeType: 'application/json';
    maxOutputTokens: number;
    temperature?: number;
    thinkingConfig: { thinkingLevel: 'minimal'; includeThoughts: false } | { thinkingBudget: 0 };
  };
}

const outputTokens: Record<GeminiMode, number> = { chat: 2048, estimate: 512, transcribe: 1024 };
const legacyTemperatures: Record<GeminiMode, number> = { chat: 0.7, estimate: 0.2, transcribe: 0 };

/** Resolve an explicit request profile; an unknown model must not inherit incompatible controls. */
export function resolveGeminiConfig(value: string | undefined, mode: GeminiMode): GeminiConfig {
  const model = value === undefined ? DEFAULT_GEMINI_MODEL : value.trim();
  if (model !== DEFAULT_GEMINI_MODEL && model !== 'gemini-2.5-flash') {
    throw new AIError('ai_configuration', 503,
      'El asistente no está disponible temporalmente. Intentá nuevamente.', 60);
  }
  return {
    model,
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: outputTokens[mode],
      ...(model === DEFAULT_GEMINI_MODEL
        ? { thinkingConfig: { thinkingLevel: 'minimal' as const, includeThoughts: false as const } }
        // Legacy request profile retained only for a temporary, explicit rollback.
        : { temperature: legacyTemperatures[mode], thinkingConfig: { thinkingBudget: 0 as const } }),
    },
  };
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Read only the final answer. Thought text and opaque signatures never enter the JSON contract. */
export function extractGeminiResponseText(value: unknown): string {
  const candidates = object(value).candidates;
  if (!Array.isArray(candidates)) return '';
  const parts = object(object(candidates[0]).content).parts;
  if (!Array.isArray(parts)) return '';
  return parts.map(value => {
    const part = object(value);
    return part.thought !== true && typeof part.text === 'string' ? part.text : '';
  }).join('').trim();
}
