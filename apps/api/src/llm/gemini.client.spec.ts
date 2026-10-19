import { GeminiClient } from './gemini.client';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('GeminiClient', () => {
  const signal = new AbortController().signal;

  it('calls generateContent with the key in a header and returns the text', async () => {
    const fetchMock = jest.fn(async () =>
      ok({ candidates: [{ content: { parts: [{ text: 'See you ' }, { text: 'Tuesday, Ada.' }] } }] }),
    );
    const client = new GeminiClient('test-key', 'gemini-2.5-flash-lite', fetchMock);

    await expect(client.generate({ system: 'Be kind.', prompt: 'First name: Ada', signal })).resolves.toBe(
      'See you Tuesday, Ada.',
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
    expect(url).not.toContain('test-key'); // the key never goes in the URL
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(init.signal).toBe(signal);
    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: 'Be kind.' }] },
      contents: [{ role: 'user', parts: [{ text: 'First name: Ada' }] }],
      generationConfig: { maxOutputTokens: 120, temperature: 0.7 },
    });
  });

  it('throws on an error status, so the caller falls back', async () => {
    const client = new GeminiClient('k', 'm', async () => new Response('quota', { status: 429 }));
    await expect(client.generate({ system: '', prompt: '', signal })).rejects.toThrow('Gemini responded with 429');
  });

  it("includes Google's explanation in the error, so the log says what to fix", async () => {
    const client = new GeminiClient('k', 'old-model', async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 404, message: 'This model is no longer available to new users.' } }),
          {
            status: 404,
          },
        ),
      ),
    );
    await expect(client.generate({ system: '', prompt: '', signal })).rejects.toThrow(
      'Gemini responded with 404: This model is no longer available to new users.',
    );
  });

  it('throws when the answer has no text, e.g. when it was blocked', async () => {
    const client = new GeminiClient('k', 'm', async () => ok({ candidates: [] }));
    await expect(client.generate({ system: '', prompt: '', signal })).rejects.toThrow('Gemini returned no text');
  });
});
