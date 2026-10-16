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
    // Every screen draws text in the theme's typefaces (Sora, Inter, JetBrains Mono) through the
    // app's own Text and TextInput; React Native's would silently fall back to the system font.
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/Text.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput'],
              message:
                "Import Text and TextInput from '@/src/components/ui/Text' (the theme's fonts).",
            },
          ],
        },
      ],
    },
  },
]);
