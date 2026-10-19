import { readConfig } from './config';

const BASE = {
  DATABASE_URL: 'postgresql://localhost/slotbook',
  HOST_ACCESS_KEY: 'a-long-enough-host-key',
  APP_TIMEZONE: 'Europe/Berlin',
};

describe('readConfig TRUST_PROXY', () => {
  it('trusts no proxy by default', () => {
    expect(readConfig(BASE).trustProxy).toBe(0);
  });

  it('reads a hop count', () => {
    expect(readConfig({ ...BASE, TRUST_PROXY: '3' }).trustProxy).toBe(3);
  });

  it.each(['-1', '1.5', 'true', 'yes'])('rejects %p', (value) => {
    expect(() => readConfig({ ...BASE, TRUST_PROXY: value })).toThrow('TRUST_PROXY');
  });
});
