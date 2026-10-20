import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/src/components/ui/Text';
import { darkPalette, fontWeight, PINNED_MAX_FONT_SCALE } from '@/src/theme';

import { NAME_AREA, SET_CODE_AREA, type CardArea } from './cardAreas';
import type { Size, ViewRect } from './frameMapping';
import { SCAN_COPY } from './scanCopy';

/** The frame's corner radius and its corner marks (mockup screen 27). */
const FRAME_RADIUS = 16;
const MARK = 34;
const MARK_WIDTH = 4;
/** What dims the picture around the frame (the mockup's rgba(0, 0, 0, 0.5)). */
const DIM = 'rgba(0, 0, 0, 0.5)';
const LINE = 'rgba(255, 255, 255, 0.8)';
const LABEL_BACKGROUND = 'rgba(20, 18, 16, 0.85)';
const WHITE = '#FFFFFF';
/** The camera screen is dark whatever the theme (its picture is the camera's). */
const INK = darkPalette.ink;

/** A rounded rectangle as an SVG path, drawn clockwise. */
function roundedRect({ x, y, width, height }: ViewRect, r: number): string {
  return [
    `M${x + r} ${y}`,
    `H${x + width - r}`,
    `A${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V${y + height - r}`,
    `A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

/** An area of the card, in points of the screen, from its fractions of the frame. */
export function areaRect(frame: ViewRect, area: CardArea): ViewRect {
  return {
    x: frame.x + area.left * frame.width,
    y: frame.y + area.top * frame.height,
    width: (area.right - area.left) * frame.width,
    height: (area.bottom - area.top) * frame.height,
  };
}

export interface CameraFrameOverlayProps {
  /** The card-shaped frame, in points of the screen (the camera preview fills the screen). */
  frame: ViewRect;
  /** The screen (the preview) it sits on. */
  size: Size;
}

/**
 * The card-shaped frame over the camera (59 × 86 mm, mockup screen 27): the picture around it
 * dimmed, its four corner marks, and the two areas the phone reads, outlined and labelled "Name"
 * and "Set code" (`cardAreas.ts`: what is outlined is what is read).
 */
export function CameraFrameOverlay({ frame, size }: CameraFrameOverlayProps) {
  const name = areaRect(frame, NAME_AREA);
  const code = areaRect(frame, SET_CODE_AREA);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="scan-frame-overlay">
      <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
        <Path
          d={`M0 0 H${size.width} V${size.height} H0 Z ${roundedRect(frame, FRAME_RADIUS)}`}
          fill={DIM}
          fillRule="evenodd"
        />
      </Svg>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={SCAN_COPY.frame}
        style={[
          styles.frame,
          { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
        ]}
        testID="scan-frame"
      >
        <View style={[styles.mark, styles.topLeft]} />
        <View style={[styles.mark, styles.topRight]} />
        <View style={[styles.mark, styles.bottomLeft]} />
        <View style={[styles.mark, styles.bottomRight]} />
      </View>
      <View
        style={[
          styles.area,
          { left: name.x, top: name.y, width: name.width, height: name.height, borderRadius: 8 },
        ]}
      />
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.label, { left: name.x, top: name.y + name.height + 5 }]}
        testID="scan-frame-name"
      >
        {SCAN_COPY.nameArea}
      </Text>
      <View
        style={[
          styles.area,
          { left: code.x, top: code.y, width: code.width, height: code.height, borderRadius: 6 },
        ]}
      />
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[
          styles.label,
          { right: size.width - (code.x + code.width), top: code.y + code.height + 5 },
        ]}
        testID="scan-frame-set-code"
      >
        {SCAN_COPY.setCodeArea}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderRadius: FRAME_RADIUS },
  mark: { position: 'absolute', width: MARK, height: MARK, borderColor: WHITE },
  topLeft: {
    left: -2,
    top: -2,
    borderLeftWidth: MARK_WIDTH,
    borderTopWidth: MARK_WIDTH,
    borderTopLeftRadius: FRAME_RADIUS,
  },
  topRight: {
    right: -2,
    top: -2,
    borderRightWidth: MARK_WIDTH,
    borderTopWidth: MARK_WIDTH,
    borderTopRightRadius: FRAME_RADIUS,
  },
  bottomLeft: {
    left: -2,
    bottom: -2,
    borderLeftWidth: MARK_WIDTH,
    borderBottomWidth: MARK_WIDTH,
    borderBottomLeftRadius: FRAME_RADIUS,
  },
  bottomRight: {
    right: -2,
    bottom: -2,
    borderRightWidth: MARK_WIDTH,
    borderBottomWidth: MARK_WIDTH,
    borderBottomRightRadius: FRAME_RADIUS,
  },
  area: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderColor: LINE },
  label: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: LABEL_BACKGROUND,
    color: INK,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: fontWeight.semibold,
  },
});
