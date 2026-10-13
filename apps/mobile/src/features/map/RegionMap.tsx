import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { memo, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { publicKeys } from '@/src/api/queryKeys';
import { Button } from '@/src/components/ui/Button';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { elevation, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  MAX_MAP_ZOOM,
  ZOOM_STEP,
  baseWindow,
  liveTransform,
  panWindow,
  pointToUnits,
  sameWindow,
  unitsPerPoint,
  viewBoxOf,
  zoomOf,
  zoomWindow,
  type MapSize,
  type MapWindow,
} from './mapWindow';
import { loadRegionOutline, meshPath, shapeAt, type RegionOutline } from './regionOutline';
import { SHADE_OPACITY, shadeLevel } from './shading';

/** A touch that travels less than this many points is a tap on a state, not a drag. */
const TAP_TRAVEL = 8;
/** A tap beside a small state still picks it, within this many points. */
const TAP_REACH = 10;

/**
 * The drawing of a region (a file of the app, ADR 0017), read when that region is first shown.
 * Nothing is asked from a server, so it also loads offline.
 */
export function useRegionOutline(region: string) {
  return useQuery<RegionOutline, Error>({
    queryKey: publicKeys.regionOutline(region),
    queryFn: () => loadRegionOutline(region),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    networkMode: 'always',
  });
}

export interface RegionMapProps {
  region: string;
  /** "Europe": the map's name for screen readers. */
  regionLabel: string;
  /** Public binders per state or province code. */
  counts: ReadonlyMap<string, number>;
  /** The state or province last opened, outlined on the map. */
  selected: string | null;
  onPick: (code: string) => void;
  /** True while a finger is on the map: a scrolling page stands still meanwhile. */
  onTouching?: (touching: boolean) => void;
  /**
   * The frame has not its final size yet (the page is still being laid out): nothing is drawn
   * until it has, so the map is drawn once, at its real size. A numeric `height` in `style` is
   * waited for too.
   */
  pending?: boolean;
  style?: ViewStyle;
  testID?: string;
}

interface MapView {
  /** The region and frame this view belongs to. */
  key: string;
  /** The window the vectors are drawn for. */
  drawn: MapWindow;
  /** The window on screen: `drawn`, moved by the gesture in progress. */
  live: MapWindow;
}

interface Touches {
  count: number;
  x: number;
  y: number;
  /** Gap between two fingers (0 with one). */
  spread: number;
}

function touchesOf(event: GestureResponderEvent): Touches {
  const touches = event.nativeEvent.touches ?? [];
  const first = touches[0];
  const second = touches[1];
  if (first && second) {
    return {
      count: 2,
      x: (first.pageX + second.pageX) / 2,
      y: (first.pageY + second.pageY) / 2,
      spread: Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY),
    };
  }
  const only = first ?? event.nativeEvent;
  return { count: 1, x: only.pageX, y: only.pageY, spread: 0 };
}

/**
 * The region map (the web's `app-boundary-map`, ADR 0017): the countries of a platform region
 * with their states and provinces outlined and shaded by their number of public binders, drawn as
 * vectors on the device with react-native-svg from the bundled drawing. No tile, no map provider,
 * no request, no device location.
 *
 * Tapping a state or province opens it; pinching, dragging and the buttons zoom and move. During
 * a gesture the picture is only slid and scaled; the vectors are drawn again once, when the
 * fingers lift. Screen readers get the map as one image and choose a place from the list.
 */
export function RegionMap({
  region,
  regionLabel,
  counts,
  selected,
  onPick,
  onTouching,
  pending = false,
  style,
  testID = 'region-map',
}: RegionMapProps) {
  const { palette } = useTheme();
  const outlineQuery = useRegionOutline(region);
  const outline = outlineQuery.data ?? null;
  const [laidOut, setLaidOut] = useState<MapSize | null>(null);
  // When the screen gives the frame a height, a layout measured at another height is not the
  // frame's size yet: the frame keeps its first height for one commit after the screen changes
  // it, and a map drawn for that height would be drawn again at once for the real one.
  const givenHeight = StyleSheet.flatten(style)?.height;
  const settled =
    laidOut !== null &&
    (typeof givenHeight !== 'number' || Math.abs(laidOut.height - givenHeight) < 1);
  const size = pending || !settled ? null : laidOut;
  const base = useMemo(() => (outline && size ? baseWindow(outline, size) : null), [outline, size]);

  // The view starts over on another region or another frame (a rotation, a resized window).
  const key = size ? `${region}|${size.width}x${size.height}` : '';
  const [stored, setStored] = useState<MapView | null>(null);
  const view: MapView | null = base
    ? stored && stored.key === key
      ? stored
      : { key, drawn: base, live: base }
    : null;
  if (view && view !== stored) {
    setStored(view);
  }

  /** The gesture in progress (touch positions are read in event handlers only). */
  const gesture = useRef<{
    origin: { x: number; y: number };
    start: { x: number; y: number };
    last: Touches;
    travel: number;
    fingers: number;
  } | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (laidOut?.width !== width || laidOut.height !== height)) {
      setLaidOut({ width, height });
    }
  };

  const update = (change: (current: MapView) => MapView) =>
    setStored((current) => (current && current.key === key ? change(current) : current));

  const begin = (event: GestureResponderEvent) => {
    const touches = touchesOf(event);
    const { pageX, pageY, locationX, locationY } = event.nativeEvent;
    gesture.current = {
      origin: { x: pageX - locationX, y: pageY - locationY },
      start: { x: touches.x, y: touches.y },
      last: touches,
      travel: 0,
      fingers: touches.count,
    };
    onTouching?.(true);
    // Android: the page behind does not take the gesture over.
    return true;
  };

  const move = (event: GestureResponderEvent) => {
    const current = gesture.current;
    if (!current || !outline || !size || !base) {
      return;
    }
    const touches = touchesOf(event);
    const last = current.last;
    current.last = touches;
    current.fingers = Math.max(current.fingers, touches.count);
    current.travel = Math.max(
      current.travel,
      Math.hypot(touches.x - current.start.x, touches.y - current.start.y)
    );
    if (touches.count !== last.count) {
      // A finger landed or lifted: the next move starts from here.
      return;
    }
    const dx = touches.x - last.x;
    const dy = touches.y - last.y;
    const pinch = touches.count === 2 && last.spread > 0 ? touches.spread / last.spread : 1;
    if (dx === 0 && dy === 0 && pinch === 1) {
      return;
    }
    const focus = {
      x: (touches.x - current.origin.x) / size.width,
      y: (touches.y - current.origin.y) / size.height,
    };
    update((now) => {
      let live = panWindow(now.live, outline, size, dx, dy);
      if (pinch !== 1) {
        live = zoomWindow(live, base, outline, pinch, focus);
      }
      return { ...now, live };
    });
  };

  const end = (tapped: boolean) => {
    const current = gesture.current;
    gesture.current = null;
    onTouching?.(false);
    if (!current || !outline || !size || !view) {
      return;
    }
    if (tapped && current.fingers === 1 && current.travel < TAP_TRAVEL) {
      const point = pointToUnits(
        view.live,
        size,
        current.start.x - current.origin.x,
        current.start.y - current.origin.y
      );
      const code = shapeAt(outline, point.x, point.y, TAP_REACH * unitsPerPoint(view.live, size));
      if (code) {
        onPick(code);
      }
    }
    // The fingers lifted: the vectors are drawn once for the window the gesture ended on.
    update((now) => (sameWindow(now.drawn, now.live) ? now : { ...now, drawn: now.live }));
  };

  const zoomBy = (factor: number) => {
    if (outline && base) {
      update((now) => {
        const next = zoomWindow(now.live, base, outline, factor);
        return { ...now, drawn: next, live: next };
      });
    }
  };
  const zoom = view && base ? zoomOf(view.live, base) : 1;
  const moved = !!view && !!base && !sameWindow(view.live, base);

  const label = `Map of ${regionLabel}: states and provinces shaded by their number of public binders`;
  const transform =
    view && size && !sameWindow(view.drawn, view.live)
      ? liveTransform(view.drawn, view.live, size)
      : null;

  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: palette.surfaceVariant, borderColor: palette.border },
        style,
      ]}
      onLayout={onLayout}
      testID={`${testID}-frame`}
    >
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityHint="To choose a state or province, use the list."
        pointerEvents="box-only"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={begin}
        onResponderMove={move}
        onResponderRelease={() => end(true)}
        onResponderTerminate={() => end(false)}
        style={[styles.fill, WEB_SURFACE]}
        testID={testID}
      >
        {view && outline && size ? (
          <View
            style={[
              styles.fill,
              transform
                ? {
                    transform: [
                      { translateX: transform.translateX },
                      { translateY: transform.translateY },
                      { scale: transform.scale },
                    ],
                  }
                : null,
            ]}
          >
            <MapDrawing
              outline={outline}
              window={view.drawn}
              size={size}
              counts={counts}
              selected={selected}
              land={palette.surface}
              line={palette.borderStrong}
              border={palette.textMuted}
              tint={palette.primary}
              ink={palette.ink}
            />
          </View>
        ) : null}
      </View>

      {outlineQuery.isError ? (
        <View
          accessibilityRole="alert"
          style={[styles.notice, { backgroundColor: palette.surface }, elevation.floating]}
          testID={`${testID}-error`}
        >
          <MaterialCommunityIcons name="map-marker-off-outline" size={24} color={palette.danger} />
          <Text style={[textStyle('sm'), styles.noticeText, { color: palette.ink }]}>
            The map could not be drawn. The list still works.
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => void outlineQuery.refetch()}
            testID={`${testID}-retry`}
          />
        </View>
      ) : !view ? (
        <View
          accessibilityLabel="Loading the map"
          aria-busy
          style={styles.loading}
          testID={`${testID}-loading`}
        >
          <Skeleton width="100%" height={size?.height ?? 240} radius={0} />
        </View>
      ) : (
        <View style={styles.controls} pointerEvents="box-none">
          <MapButton
            icon="plus"
            label="Zoom in"
            disabled={zoom >= MAX_MAP_ZOOM - 0.01}
            onPress={() => zoomBy(ZOOM_STEP)}
            testID={`${testID}-zoom-in`}
          />
          <MapButton
            icon="minus"
            label="Zoom out"
            disabled={zoom <= 1.01}
            onPress={() => zoomBy(1 / ZOOM_STEP)}
            testID={`${testID}-zoom-out`}
          />
          {moved ? (
            <MapButton
              icon="fit-to-screen-outline"
              label="Show the whole region"
              onPress={() => base && update((now) => ({ ...now, drawn: base, live: base }))}
              testID={`${testID}-reset`}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

/** On the web a drag on the map must not scroll or zoom the page, nor select text. */
const WEB_SURFACE = (
  Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none', cursor: 'grab' } : null
) as ViewStyle | null;

interface MapDrawingProps {
  outline: RegionOutline;
  window: MapWindow;
  size: MapSize;
  counts: ReadonlyMap<string, number>;
  selected: string | null;
  land: string;
  line: string;
  border: string;
  tint: string;
  ink: string;
}

/**
 * The vectors, drawn only when the window, the counts, the selection or the theme change (never
 * while a finger moves). Every state and province without a binder is part of ONE path, the
 * country borders of another: a region costs two elements plus one per shaded state, not one per
 * state.
 */
const MapDrawing = memo(function MapDrawing({
  outline,
  window,
  size,
  counts,
  selected,
  land,
  line,
  border,
  tint,
  ink,
}: MapDrawingProps) {
  const mesh = useMemo(() => meshPath(outline), [outline]);
  const shaded = useMemo(
    () => outline.shapes.filter((shape) => shadeLevel(counts.get(shape.code)) > 0),
    [outline, counts]
  );
  const chosen = selected ? outline.shapes.find((shape) => shape.code === selected) : undefined;
  // Line widths are given in screen points, whatever the zoom.
  const point = unitsPerPoint(window, size);
  return (
    <Svg width={size.width} height={size.height} viewBox={viewBoxOf(window)} testID="map-drawing">
      <Path
        d={mesh}
        fill={land}
        stroke={line}
        strokeWidth={0.6 * point}
        strokeLinejoin="round"
        testID="map-states"
      />
      {shaded.map((shape) => (
        <Path
          key={shape.code}
          d={shape.d}
          fill={tint}
          fillOpacity={SHADE_OPACITY[shadeLevel(counts.get(shape.code))]}
          stroke={line}
          strokeWidth={0.6 * point}
          strokeLinejoin="round"
          testID={`map-shape-${shape.code}`}
        />
      ))}
      <Path
        d={outline.outline}
        fill="none"
        stroke={border}
        strokeWidth={1 * point}
        strokeLinejoin="round"
        testID="map-countries"
      />
      {chosen ? (
        <Path
          d={chosen.d}
          fill="none"
          stroke={ink}
          strokeWidth={2.5 * point}
          strokeLinejoin="round"
          testID={`map-selected-${chosen.code}`}
        />
      ) : null}
    </Svg>
  );
});

function MapButton({
  icon,
  label,
  disabled = false,
  onPress,
  testID,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.surface, borderColor: palette.borderStrong },
        elevation.floating,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  controls: {
    position: 'absolute',
    right: spacing[2],
    bottom: spacing[2],
    gap: spacing[2],
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    position: 'absolute',
    left: spacing[3],
    right: spacing[3],
    bottom: spacing[3],
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
  },
  noticeText: { textAlign: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
