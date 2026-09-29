// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'dist/*',
      'web-build/*',
      '.expo/*',
      'android/*',
      'ios/*',
      'coverage/*',
      'expo-env.d.ts',
      'src/theme/tokens.ts',
    ],
  },
  {
    rules: {
      // Exhaustive switches rely on `assertNever`; keep them honest.
      'no-fallthrough': 'error',
      // Only `import type` may reference the shared-types package: it is a types-only dependency.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@orenji/shared-types',
              importNames: ['default'],
              message: 'Import types only (`import type { paths } ...`).',
            },
          ],
        },
      ],
    },
  },
]);
