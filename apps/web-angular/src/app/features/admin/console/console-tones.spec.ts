import { lightColors } from '@orenji/design-tokens';
import { CONSOLE_LIGHT_TEXT } from './console-tones';

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

/** `color-mix(in srgb, tone share, transparent)` laid on an opaque `#RRGGBB` base. */
function tint(tone: string, share: number, base: string): string {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(channel(tone, offset) * share + channel(base, offset) * (1 - share))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** `--app-primary-text` in light: 60% primary, 40% ink. */
const PRIMARY_TEXT = tint(lightColors.primary, 0.6, lightColors.ink);

describe('the admin console in light (review fix 1, A3: WCAG 1.4.3)', () => {
  const c = lightColors;
  const t = CONSOLE_LIGHT_TEXT;
  const bases = [c.surface, c.background];

  it('keeps chip text at AA on its own tint, on the surface and the canvas', () => {
    for (const base of bases) {
      expect(contrast(t.warning, tint(c.warning, 0.16, base))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.success, tint(c.success, 0.16, base))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.danger, tint(c.danger, 0.16, base))).toBeGreaterThanOrEqual(4.5);
      // --color-accent-tint: teal at 12%.
      expect(contrast(t.accent, tint(c.accent, 0.12, base))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps status text at AA on plain surfaces (Unassigned, "All systems operational", Open)', () => {
    for (const base of bases) {
      for (const tone of Object.values(t)) {
        expect(contrast(tone, base)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('writes the active nav item, badges and avatars at AA on the orange tint', () => {
    // --color-primary-tint: orange at 14%.
    const primaryTint = tint(c.primary, 0.14, c.background);
    expect(contrast(c.ink, primaryTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PRIMARY_TEXT, tint(c.primary, 0.14, c.surface))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimaryContainer, tint(c.primary, 0.14, c.surface))).toBeGreaterThanOrEqual(
      4.5,
    );
    // What failed: orange on its tint.
    expect(contrast(c.primary, primaryTint)).toBeLessThan(3);
  });

  it('writes the role pill at AA on the teal tint', () => {
    expect(
      contrast(c.onAccentContainer, tint(c.accent, 0.12, c.background)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
