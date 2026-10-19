import { LlmClient } from './llm-client';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Calls Gemini's generateContent REST method. No SDK, to keep the dependency surface small.
 * Throws on any non-2xx response or an empty answer, so the caller can fall back.
 */
export class GeminiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate({ system, prompt, signal }: { system: string; prompt: string; signal: AbortSignal }): Promise<string> {
    const res = await this.fetchImpl(`${API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.7 },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Gemini responded with ${res.status}`);

    const body = (await res.json()) as GenerateContentResponse;
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text.trim()) throw new Error('Gemini returned no text');
    return text;
  }
}
