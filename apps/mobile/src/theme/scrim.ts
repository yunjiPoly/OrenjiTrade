/**
 * The colour of a scrim: a view that covers the whole window to dim what is under it (behind a
 * sheet or a dialog, behind a photo opened full screen).
 *
 * A scrim is never a translucent pure black. iOS takes a view that is exactly as large as its
 * window, with a black background the page shows through, for the dimming view of a modal: it
 * answers `accessibilityViewIsModal` for that view by itself, which tells VoiceOver to ignore
 * every view behind it in the same parent. The native view keeps that answer for as long as it
 * has the size of the window, and React Native reuses native views. So the backdrop of a closed
 * sheet came back as another full-window view of the next dialog, in front of its content, and
 * the dialog was on screen with nothing of it left for a screen reader. Found with the dark
 * theme, whose `overlay` token is `rgba(0, 0, 0, 0.6)`, in development bundles: there React
 * Native adds such a full-window view to every Modal (its debugging overlay). A release build has
 * no view of ours in that place today, which is luck, not a rule.
 *
 * Measured on iOS 27 (docs: IMPLEMENTATION_STATUS.md, "A scrim iOS takes for a modal"): black is
 * a white level under about 2 % (grey 4 of 255 is black, grey 6 is not), at 15 to 85 % opacity.
 * The darkest tone a scrim may have here is the darkest warm tone of the design system (stone
 * 950, a white level of about 4 %); the opacity of the colour it is made from is kept.
 */
export const SCRIM_FLOOR = { red: 12, green: 10, blue: 9 } as const;

const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i;
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

interface Channels {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function channelsOf(colour: string): Channels {
  const value = colour.trim();
  const rgb = RGB.exec(value);
  if (rgb) {
    return {
      red: Number(rgb[1]),
      green: Number(rgb[2]),
      blue: Number(rgb[3]),
      alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  const hex = HEX.exec(value)?.[1];
  if (hex) {
    // #RGB and #RGBA double each digit.
    const digits = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const pair = (index: number) => parseInt(digits.slice(index, index + 2), 16);
    return {
      red: pair(0),
      green: pair(2),
      blue: pair(4),
      alpha: digits.length === 8 ? Math.round((pair(6) / 255) * 100) / 100 : 1,
    };
  }
  throw new Error(`A scrim is made from an rgb(), rgba() or # colour, not from "${colour}".`);
}

/** `colour` as the colour of a scrim: the same opacity, no channel darker than `SCRIM_FLOOR`. */
export function scrimColor(colour: string): string {
  const { red, green, blue, alpha } = channelsOf(colour);
  return (
    `rgba(${Math.max(red, SCRIM_FLOOR.red)}, ${Math.max(green, SCRIM_FLOOR.green)}, ` +
    `${Math.max(blue, SCRIM_FLOOR.blue)}, ${alpha})`
  );
}
