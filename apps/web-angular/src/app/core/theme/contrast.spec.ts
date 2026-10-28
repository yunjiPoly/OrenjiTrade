import { darkColors, lightColors, tokens } from '@orenji/design-tokens';
import { ALL_GAMES, gameInfo } from '../../shared/domain/games';

/** WCAG 2.2 relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, a share%, b)` of two `#RRGGBB` colours, as the browser computes it. */
function mix(a: string, b: string, share: number): string {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(channel(a, offset) * share + channel(b, offset) * (1 - share))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** `--app-primary-text` in styles.scss: in light, 60% primary and 40% ink; in dark, primary. */
const PRIMARY_TEXT_SHARE = 0.6;

/**
 * The text pairs of the web redesign's light and dark themes (spec 2026-10-20 sections 2.1 and
 * 2.6): every pair used for text passes WCAG AA (4.5:1), large orange text and focus rings 3:1.
 */
describe('design token contrast (web redesign WA)', () => {
  it('writes ink on orange in light (owner decision 21): white failed at 2.8:1', () => {
    expect(lightColors.onPrimary).toBe('#1C1917');
    expect(contrast(lightColors.onPrimary, lightColors.primary)).toBeGreaterThanOrEqual(6.2);
    expect(contrast(lightColors.onPrimary, lightColors.primaryHover)).toBeGreaterThan(4.5);
    expect(contrast('#FFFFFF', lightColors.primary)).toBeLessThan(3);
  });

  it('keeps every light text pair at AA', () => {
    const c = lightColors;
    const pairs: [string, string, string][] = [
      ['ink on background', c.ink, c.background],
      ['ink on surface', c.ink, c.surface],
      ['muted on surface', c.textMuted, c.surface],
      ['muted on background', c.textMuted, c.background],
      ['secondary on surface', c.textSecondary, c.surface],
      ['links and teal text on background', c.accent, c.background],
      ['links on surface', c.accent, c.surface],
      ['danger text on surface', c.danger, c.surface],
      ['ink on the active rail pill (primaryContainer)', c.ink, c.primaryContainer],
      ['on primary container', c.onPrimaryContainer, c.primaryContainer],
      ['white on the destructive fill', '#FFFFFF', c.dangerFill],
    ];
    for (const [name, fg, bg] of pairs) {
      expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    }
    // The focus ring is a non-text indicator (SC 1.4.11 and 2.4.13): 3:1 on both canvases.
    expect(contrast(c.focusRing, c.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.focusRing, c.surface)).toBeGreaterThanOrEqual(3);
  });

  it('writes orange text and thin orange indicators in a tone that passes in light too', () => {
    const c = lightColors;
    // #F4761A as 14 px text was 2.7:1 (Material text and outline buttons, the search's match).
    expect(contrast(c.primary, c.background)).toBeLessThan(3);
    const text = mix(c.primary, c.ink, PRIMARY_TEXT_SHARE);
    for (const [name, bg] of [
      ['background', c.background],
      ['surface', c.surface],
      ['surfaceElevated', c.surfaceElevated],
      ['surfaceVariant (the active search row)', c.surfaceVariant],
    ] as const) {
      expect(contrast(text, bg), `orange text on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
    const d = darkColors;
    for (const bg of [d.background, d.surface, d.surfaceElevated, d.surfaceVariant]) {
      expect(contrast(d.primary, bg), `dark orange text on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps every dark text pair at AA', () => {
    const c = darkColors;
    const pairs: [string, string, string][] = [
      ['onPrimary on primary', c.onPrimary, c.primary],
      ['onPrimary on primaryHover', c.onPrimary, c.primaryHover],
      ['ink on background', c.ink, c.background],
      ['muted on surface', c.textMuted, c.surface],
      ['muted on surfaceElevated', c.textMuted, c.surfaceElevated],
      ['secondary on surface', c.textSecondary, c.surface],
      ['accent on background', c.accent, c.background],
      ['danger on surface', c.danger, c.surface],
      ['white on the destructive fill', '#FFFFFF', c.dangerFill],
    ];
    for (const [name, fg, bg] of pairs) {
      expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('adds the redesign sizes as tokens', () => {
    expect(tokens.fontSize).toMatchObject({ tag: 11, meta: 13, body: 15, section: 17, title: 28 });
    expect(tokens.radius).toMatchObject({ input: 12, row: 14, dialog: 22 });
  });

  it('draws the games from the monogram tokens, readable letter on tile', () => {
    for (const game of ALL_GAMES) {
      const tile = (tokens.gameTile as Record<string, { foreground: string; background: string }>)[
        game.tileKey
      ];
      expect(tile, game.slug).toBeTruthy();
      expect(contrast(tile.foreground, tile.background), game.slug).toBeGreaterThanOrEqual(4.5);
      expect(game.accent).toContain(`--game-tile-${game.tileKey}-`);
    }
    expect(ALL_GAMES.map((game) => game.slug)).toEqual([
      'yugioh',
      'pokemon',
      'mtg',
      'onepiece',
      'riftbound',
    ]);
    expect(gameInfo('unknown').accent).toBe('var(--color-primary)');
  });
});
