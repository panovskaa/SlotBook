/** Unit tests live next to the code (*.spec.ts); integration tests in test/ (*.int-spec.ts) run against a real Postgres. */
const common = {
  testEnvironment: 'node',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
};

module.exports = {
  projects: [
    { ...common, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...common,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      globalTeardown: '<rootDir>/test/global-teardown.ts',
    },
  ],
};
