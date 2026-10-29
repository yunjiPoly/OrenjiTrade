import { darkColors, lightColors } from '@orenji/design-tokens';

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

/** `color-mix(in srgb, a share, b)` as the browser computes it. */
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

const THEMES = [
  ['light', lightColors],
  ['dark', darkColors],
] as const;

/**
 * The text pairs of Inventory and Import (web WB) at WCAG AA (4.5:1), both themes, with the
 * carried-over fixes of WA's review: the availability chips (white on the colours was 2.8:1 in
 * light, 1.9:1 in dark), the binder counts (4.13:1 in dark), the old orange "Temporarily public"
 * label (gone: the summary is one muted line, orange text uses --app-primary-text).
 */
describe('Inventory and Import contrast (web WB)', () => {
  it('writes the visibility tags and the import statuses at AA', () => {
    for (const [name, c] of THEMES) {
      const light = name === 'light';
      const publicBg = mix(c.accent, c.surface, light ? 0.1 : 0.14);
      const publicText = light ? mix(c.accent, c.ink, 0.85) : c.accent;
      expect(contrast(publicText, publicBg), `${name} Public / Ready`).toBeGreaterThanOrEqual(4.5);
      const pendingBg = mix(c.warning, c.surface, light ? 0.22 : 0.14);
      const pendingText = light ? mix(c.warning, c.ink, 0.6) : c.warning;
      expect(contrast(pendingText, pendingBg), `${name} Public · not visible / Which copy?`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.textMuted, c.surfaceVariant), `${name} Private`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('writes the availability chips\' labels in the theme\'s ink on a faint tint of their colour', () => {
    for (const [name, c] of THEMES) {
      for (const [key, colour] of Object.entries(c.availability)) {
        if (!colour.startsWith('#') || key === 'notAvailable') {
          continue;
        }
        expect(contrast(c.ink, mix(colour, c.surface, 0.14)), `${name} ${key}`).toBeGreaterThanOrEqual(4.5);
      }
      // Trade or sale: a gradient of the two tints, the label passes on both ends.
      expect(contrast(c.ink, mix(c.availability.trade, c.surface, 0.14))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.ink, mix(c.availability.sale, c.surface, 0.14))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.textMuted, c.surface), `${name} not available`).toBeGreaterThanOrEqual(4.5);
    }
    // What failed before WB: white on the light sale orange and on the dark trade teal.
    expect(contrast('#FFFFFF', lightColors.availability.sale)).toBeLessThan(3);
    expect(contrast('#FFFFFF', darkColors.availability.trade)).toBeLessThan(2);
  });

  it('writes the binder pane\'s counts and labels in textSecondary, AA on every row', () => {
    for (const [name, c] of THEMES) {
      for (const [where, bg] of [
        ['background', c.background],
        ['surfaceVariant (the chosen row)', c.surfaceVariant],
        ['surface', c.surface],
      ] as const) {
        expect(contrast(c.textSecondary, bg), `${name} count on ${where}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('writes the deck core tag and the banners at AA', () => {
    for (const [name, c] of THEMES) {
      expect(contrast(c.deckCore.tagText, c.deckCore.tagBackground), `${name} deck core tag`).toBeGreaterThanOrEqual(4.5);
      const banner = mix(c.warning, c.surface, 0.08);
      expect(contrast(c.ink, banner), `${name} banner text`).toBeGreaterThanOrEqual(4.5);
      const pill = name === 'light' ? mix(c.warning, c.ink, 0.6) : c.warning;
      expect(contrast(pill, banner), `${name} "Still have them"`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accent, banner), `${name} "Show them"`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('fills the chosen segment with ink and writes it in the canvas colour', () => {
    for (const [name, c] of THEMES) {
      expect(contrast(c.background, c.ink), `${name} chosen segment`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.textSecondary, c.surfaceVariant), `${name} other segments`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
