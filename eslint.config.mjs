// NFR-8: one flat config for the whole monorepo. Prettier owns formatting, ESLint owns correctness.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      'e2e/playwright-report/',
      'e2e/test-results/',
      '.agents/',
      '.claude/',
    ],
  },

  js.configs.recommended,

  // Type-aware strict rules for every TypeScript file, each checked against its own project's tsconfig.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [
          'apps/api/tsconfig.test.json',
          'apps/web/tsconfig.json',
          'packages/shared/tsconfig.json',
          'e2e/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers and booleans in template strings are fine; objects are not.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-definitions': 'off',
      // `onClick={() => setOpen(false)}` is clear enough; block bodies only for longer handlers.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // react-hook-form's handleSubmit returns a promise-returning handler, which React handles fine.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // `env.X || default` deliberately treats an empty string as unset.
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],
      // Used only right after a check that guarantees the value (validated env, valid Luxon dates, #root).
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // API: NestJS uses classes with only decorators, and modules are empty classes by design.
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  // Tests: supertest bodies are `any`, and mocks often stand in for async functions without awaiting.
  {
    files: ['**/*.spec.ts', '**/*.int-spec.ts', '**/*.test.{ts,tsx}', 'apps/api/test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  // Web app: React hooks rules and accessibility (NFR-1). A missing alt fails the lint.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      'jsx-a11y/alt-text': 'error',
    },
  },

  {
    files: ['e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Plain JavaScript (configs and small Node scripts): CommonJS unless it is an .mjs file.
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },

  prettier,
);
