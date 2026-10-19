import { ExecutionContext } from '@nestjs/common';
import { AppConfig } from '../config';
import { HostKeyGuard } from './host-key.guard';

const contextWithKey = (key?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => (name === 'x-host-key' ? key : undefined) }),
    }),
  }) as unknown as ExecutionContext;

describe('HostKeyGuard', () => {
  const guard = new HostKeyGuard({ hostAccessKey: 'the-right-key-123456' } as AppConfig);

  it('lets the right key through', () => {
    expect(guard.canActivate(contextWithKey('the-right-key-123456'))).toBe(true);
  });

  it.each([undefined, '', 'wrong', 'the-right-key-12345', 'the-right-key-1234567'])('rejects %p with 401', (key) => {
    expect(() => guard.canActivate(contextWithKey(key))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }) }),
    );
  });
});
