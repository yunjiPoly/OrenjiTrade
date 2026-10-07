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
      'src/legal/legalContent.ts',
      'src/legal/legalContent.fr.ts',
    ],
  },
  {
    rules: {
      // Exhaustive switches rely on `assertNever`; keep them honest.
      'no-fallthrough': 'error',
    },
  },
  {
    // Testing Library 14 (Expo SDK 58): render, renderHook, fireEvent, act, rerender and unmount
    // return promises; one that is not awaited lets a test assert before the screen updated.
    files: ['__tests__/**/*.ts', '__tests__/**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
  {
    // jest.mock factories are hoisted above the imports, so they load modules with require().
    files: ['__tests__/**/*.ts', '__tests__/**/*.tsx', 'jest.setup.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
