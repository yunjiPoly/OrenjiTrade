import fs from 'node:fs';
import path from 'node:path';

import { darkPalette, lightPalette } from '@/src/theme/palette';
import { tokens } from '@/src/theme/tokens';

/** WCAG relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('design tokens of the phone redesign (spec 2026-10-14, section 3)', () => {
  it('keeps the mockup’s dark palette', () => {
    expect(darkPalette).toMatchObject({
      background: '#141210',
      surface: '#1E1B18',
      border: '#292524',
      borderStrong: '#44403C',
      ink: '#F5F5F4',
      textMuted: '#A8A29E',
      primary: '#FF8F3D',
      onPrimary: '#2A1200',
      accent: '#2DD4BF',
      danger: '#F87171',
      warning: '#FBBF24',
    });
    expect(darkPalette.online.online).toBe('#4ADE80');
  });

  it('adds the deckCore family in dark and in matching light values', () => {
    // surface and border (stage R3): the "Sell as a deck core" card and a deck core's row.
    expect(darkPalette.deckCore).toEqual({
      tagBackground: '#2E2547',
      tagText: '#C4B5FD',
      switch: '#8B5CF6',
      surface: '#1A1720',
      border: '#4C3D74',
    });
    expect(lightPalette.deckCore).toEqual({
      tagBackground: '#EDE9FE',
      tagText: '#5B21B6',
      switch: '#7C3AED',
      surface: '#FAF7FF',
      border: '#C4B5FD',
    });
    // The tag stays readable in both themes (WCAG AA for small text).
    for (const palette of [darkPalette, lightPalette]) {
      expect(contrast(palette.deckCore.tagText, palette.deckCore.tagBackground)).toBeGreaterThan(
        4.5
      );
      expect(contrast(palette.deckCore.switch, palette.surface)).toBeGreaterThan(3);
      // Text on the card stays as readable as on the screen's own surface.
      expect(contrast(palette.ink, palette.deckCore.surface)).toBeGreaterThan(12);
      expect(contrast(palette.textMuted, palette.deckCore.surface)).toBeGreaterThan(4.5);
    }
  });

  it('writes ink on orange in light (owner decision 21 of the web redesign, stage WA)', () => {
    // White on #F4761A was 2.8:1 and failed AA; ink is 6.2:1. Dark keeps its own pair.
    expect(lightPalette.onPrimary).toBe('#1C1917');
    expect(contrast(lightPalette.onPrimary, lightPalette.primary)).toBeGreaterThan(4.5);
    expect(contrast(darkPalette.onPrimary, darkPalette.primary)).toBeGreaterThan(4.5);
    // The web-only group never reaches the phone; the additive colours do.
    expect('notificationKind' in tokens.color.light).toBe(false);
    expect(tokens.color.light.primaryTint).toBe('rgba(244, 118, 26, 0.14)');
    expect(tokens.radius.dialog).toBe(22);
    expect(tokens.fontSize.title).toBe(28);
  });

  it('names the three font families the phone loads', () => {
    expect(tokens.font.display.mobile).toBe('Sora');
    expect(tokens.font.body.mobile).toBe('Inter');
    expect(tokens.font.mono.mobile).toBe('JetBrains Mono');
  });

  it('is the synced copy of packages/design-tokens (npm run sync:tokens)', () => {
    const json = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'design-tokens', 'tokens.json'),
        'utf8'
      )
    ) as { color: Record<'light' | 'dark', { deckCore: Record<string, unknown> }> };
    for (const scheme of ['light', 'dark'] as const) {
      // The metadata key that keeps the group out of the web's CSS never reaches the phone.
      const { $platforms, ...colours } = json.color[scheme].deckCore;
      expect($platforms).toEqual(['mobile']);
      expect(tokens.color[scheme].deckCore).toEqual(colours);
    }
  });
});
