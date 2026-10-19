/** Anything that can turn a prompt into text. Gemini in production; a fake in tests. */
export interface LlmClient {
  generate(request: { system: string; prompt: string; signal: AbortSignal }): Promise<string>;
}

/** Injection token. Resolves to null when no API key is configured, so callers use their fallback. */
export const LLM_CLIENT = Symbol('LLM_CLIENT');
