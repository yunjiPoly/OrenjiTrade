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
]);
