import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** A gradient stop as react-native-svg draws it on every platform: a colour and its own opacity. */
export type GradientStop = { color: string; opacity: number };

const RGBA = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/i;

/**
 * Splits a colour into what a `<Stop>` takes: `rgba(r, g, b, a)` becomes `rgb(r, g, b)` with the
 * opacity `a` (stage R8's walk: on iOS react-native-svg drew the guest card's `rgba` stops opaque,
 * a bright orange and teal box under unreadable text, where the mockup has a faint tint). Any other
 * colour is kept whole, at full opacity.
 */
export function gradientStop(color: string): GradientStop {
  const match = RGBA.exec(color.trim());
  if (!match) {
    return { color, opacity: 1 };
  }
  const opacity = Math.min(1, Math.max(0, Number(match[4])));
  return { color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, opacity };
}

/**
 * A gradient behind a box (the mockup's `linear-gradient`), drawn with react-native-svg. The
 * drawing takes the box's whole frame from its style alone (`absoluteFill`): a `width="100%"` on
 * the `<Svg>` as well made iOS size it to the box's content, 14 pt short on each side of the
 * guest card (stage R8's walk).
 */
export function GradientFill({
  from,
  to,
  angle,
  id,
  radius = 0,
  testID,
}: {
  from: string;
  to: string;
  /** `diagonal`: 135° as the guest card; `down`: 160° as the illustrated cards. */
  angle: 'diagonal' | 'down';
  id: string;
  radius?: number;
  testID?: string;
}) {
  const end = angle === 'diagonal' ? { x2: '1', y2: '1' } : { x2: '0.35', y2: '1' };
  const start = gradientStop(from);
  const stop = gradientStop(to);
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" testID={testID}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" {...end}>
          <Stop offset="0" stopColor={start.color} stopOpacity={start.opacity} />
          <Stop offset="1" stopColor={stop.color} stopOpacity={stop.opacity} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  );
}
