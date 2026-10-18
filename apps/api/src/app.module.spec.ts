import { redactTokens, serializeRequest } from './app.module';

describe('serializeRequest', () => {
  it('keeps the private token out of every part of a logged request', () => {
    const token = 'rCkKEk4dVE2QWJDzImd_gaWGJC_AWNfJaaV40dFLGdg';
    const logged = serializeRequest({
      id: 'req-1',
      method: 'POST',
      url: `/manage/${token}/cancel`,
      params: { path: ['manage', token, 'cancel'] },
      query: {},
    });
    expect(JSON.stringify(logged)).not.toContain(token);
    expect(logged).toEqual({ id: 'req-1', method: 'POST', url: '/manage/[redacted]/cancel', query: {} });
  });
});

describe('redactTokens', () => {
  it.each([
    ['/manage/abcDEF123_-xyz', '/manage/[redacted]'],
    ['/manage/abcDEF123_-xyz/cancel', '/manage/[redacted]/cancel'],
    ['/waitlist/abc?x=1', '/waitlist/[redacted]?x=1'],
    ['/slots?from=2026-11-02&to=2026-11-08', '/slots?from=2026-11-02&to=2026-11-08'],
    ['/bookings/ref/K7M2-QX9P', '/bookings/ref/K7M2-QX9P'],
  ])('logs %p as %p', (url, expected) => {
    expect(redactTokens(url)).toBe(expected);
  });

  it('leaves a missing URL alone', () => {
    expect(redactTokens(undefined)).toBeUndefined();
  });
});
