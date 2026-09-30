#!/usr/bin/env node
/**
 * Generates `src/theme/tokens.ts` from `packages/design-tokens/tokens.json` when that file exists.
 *
 * The mobile app consumes a FIXED token shape (`FALLBACK_TOKENS` below, which mirrors
 * packages/design-tokens/tokens.json and docs/design/design-system.md). Values from `tokens.json`
 * are deep-merged over the fallback so a partial token file can never break the app: known keys
 * always exist, matching keys are overridden, extra keys are appended. `$`-prefixed metadata keys
 * are dropped and Style-Dictionary style `{ "value": ... }` leaves are unwrapped.
 *
 * Usage: `npm run sync:tokens`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const tokensJsonPath = resolve(projectRoot, '../../packages/design-tokens/tokens.json');
const outputPath = resolve(projectRoot, 'src/theme/tokens.ts');

/** Fallback values (docs/design/design-system.md). Same shape as packages/design-tokens/tokens.json. */
const FALLBACK_TOKENS = {
  font: {
    display: { web: '"Sora", system-ui, sans-serif', mobile: 'Sora', use: 'wordmark, page titles' },
    body: { web: '"Inter", system-ui, sans-serif', mobile: 'Inter', use: 'everything else' },
    mono: {
      web: '"JetBrains Mono", monospace',
      mobile: 'monospace',
      use: 'set codes, collector numbers',
    },
  },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36 },
  lineHeight: { body: 1.5, heading: 1.2 },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  breakpoint: { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920 },
  focus: { width: 2, offset: 2 },
  elevation: {
    none: 'none',
    floating: '0 4px 16px rgba(28, 25, 23, 0.12), 0 1px 3px rgba(28, 25, 23, 0.08)',
    sheet: '0 -4px 24px rgba(28, 25, 23, 0.16)',
    menu: '0 8px 24px rgba(28, 25, 23, 0.16)',
  },
  motion: {
    durationFast: '120ms',
    durationBase: '200ms',
    durationSlow: '320ms',
    easingStandard: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  color: {
    light: {
      primary: '#F4761A',
      onPrimary: '#FFFFFF',
      primaryContainer: '#FFE1CB',
      onPrimaryContainer: '#4A1F00',
      accent: '#0F766E',
      onAccent: '#FFFFFF',
      accentContainer: '#CCF1EC',
      onAccentContainer: '#053B37',
      ink: '#1C1917',
      textMuted: '#57534E',
      textDisabled: '#A8A29E',
      background: '#FFFBF7',
      surface: '#FFFFFF',
      surfaceVariant: '#F5EFE8',
      surfaceElevated: '#FFFFFF',
      border: '#E7E5E4',
      borderStrong: '#D6D3D1',
      overlay: 'rgba(28, 25, 23, 0.48)',
      focusRing: '#0F766E',
      success: '#16A34A',
      warning: '#D97706',
      danger: '#DC2626',
      info: '#2563EB',
      status: { fresh: '#16A34A', aging: '#D97706', stale: '#E4572E', hidden: '#78716C' },
      availability: {
        collection: '#78716C',
        trade: '#0F766E',
        sale: '#F4761A',
        tradeOrSale: 'linear-gradient(90deg, #0F766E 0%, #F4761A 100%)',
        offers: '#7C3AED',
        notAvailable: '#A8A29E',
      },
      online: { online: '#22C55E', recent: '#F59E0B', offline: 'transparent' },
    },
    dark: {
      primary: '#FF8F3D',
      onPrimary: '#2A1200',
      primaryContainer: '#6B2E00',
      onPrimaryContainer: '#FFDCC4',
      accent: '#2DD4BF',
      onAccent: '#003733',
      accentContainer: '#0F5F59',
      onAccentContainer: '#BFF3ED',
      ink: '#F5F5F4',
      textMuted: '#A8A29E',
      textDisabled: '#57534E',
      background: '#141210',
      surface: '#1E1B18',
      surfaceVariant: '#292522',
      surfaceElevated: '#2A2623',
      border: '#292524',
      borderStrong: '#44403C',
      overlay: 'rgba(0, 0, 0, 0.6)',
      focusRing: '#2DD4BF',
      success: '#4ADE80',
      warning: '#FBBF24',
      danger: '#F87171',
      info: '#60A5FA',
      status: { fresh: '#4ADE80', aging: '#FBBF24', stale: '#FB7A4F', hidden: '#A8A29E' },
      availability: {
        collection: '#A8A29E',
        trade: '#2DD4BF',
        sale: '#FF8F3D',
        tradeOrSale: 'linear-gradient(90deg, #2DD4BF 0%, #FF8F3D 100%)',
        offers: '#A78BFA',
        notAvailable: '#78716C',
      },
      online: { online: '#4ADE80', recent: '#FBBF24', offline: 'transparent' },
    },
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const LEAF_META_KEYS = new Set(['value', 'type', '$type', 'description', 'comment']);

/** Drops `$meta`-style keys and unwraps `{ value: x }` / `{ $value: x }` leaves recursively. */
function normalise(node) {
  if (!isPlainObject(node)) {
    return node;
  }
  if ('$value' in node) {
    return normalise(node.$value);
  }
  if ('value' in node && Object.keys(node).every((k) => LEAF_META_KEYS.has(k))) {
    return normalise(node.value);
  }
  const out = {};
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    out[key] = normalise(child);
  }
  return out;
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

function toTypeScriptLiteral(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    return `[${value.map((v) => toTypeScriptLiteral(v, indent)).join(', ')}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(([key, child]) => {
      const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      return `${padInner}${safeKey}: ${toTypeScriptLiteral(child, indent + 1)},`;
    });
    return `{\n${entries.join('\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

let source = 'fallback values (docs/design/design-system.md)';
let merged = FALLBACK_TOKENS;

if (existsSync(tokensJsonPath)) {
  try {
    const raw = JSON.parse(readFileSync(tokensJsonPath, 'utf8'));
    merged = deepMerge(FALLBACK_TOKENS, normalise(raw));
    source = 'packages/design-tokens/tokens.json (merged over fallback)';
  } catch (error) {
    console.warn(
      `[sync-tokens] Could not parse ${tokensJsonPath}: ${error.message}. Using fallback.`
    );
  }
} else {
  console.warn(
    '[sync-tokens] packages/design-tokens/tokens.json not found. Using fallback values.'
  );
}

const output = `/* eslint-disable */
// AUTO-GENERATED by scripts/sync-tokens.mjs. Do not edit by hand.
// Source: ${source}
// Regenerate with: npm run sync:tokens

export const tokens = ${toTypeScriptLiteral(merged)} as const;

export type Tokens = typeof tokens;
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output, 'utf8');
console.log(`[sync-tokens] Wrote ${outputPath} from ${source}.`);
