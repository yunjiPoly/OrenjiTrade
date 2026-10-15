import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { DECK_CORE_COPY } from './binderCopy';

/** The height of the deck core photo (mockup screen 16: about 360 pt). */
export const PHOTO_PAGER_HEIGHT = 360;

/** Which page a horizontal offset shows (the nearest one). */
export function pageAt(offsetX: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(count - 1, Math.round(offsetX / width)));
}

export interface PhotoPagerProps {
  /** The pictures, in order (a deck core's photos, or its card pictures without photos). */
  urls: readonly string[];
  /** Card pictures are shown whole on the dark background; photos fill the frame. */
  fit?: 'cover' | 'contain';
  /** The status bar's height when the pager starts at the top of the screen. */
  topInset?: number;
  testID?: string;
}

/**
 * The full-width photo of a deck core (spec 2026-10-14, section 7, screen 16): swipe between the
 * photos, page dots under them (each one a button that shows its photo) and "1 / 3" at the top
 * right. Without a picture, a frame with a deck icon and "No photos yet".
 */
export function PhotoPager({
  urls,
  fit = 'cover',
  topInset = 0,
  testID = 'deck-core-photos',
}: PhotoPagerProps) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const pictures = urls.map((url) => safeCardImageUrl(url)).filter((url): url is string => !!url);
  const count = pictures.length;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(pageAt(event.nativeEvent.contentOffset.x, width, count));
    },
    [count, width]
  );

  const show = (index: number) => {
    setPage(index);
    scroll.current?.scrollTo({ x: index * width, animated: true });
  };

  if (count === 0) {
    return (
      <View
        testID={`${testID}-empty`}
        style={[styles.frame, styles.empty, { backgroundColor: palette.deckCore.tagBackground }]}
      >
        <MaterialCommunityIcons name="cards-outline" size={48} color={palette.deckCore.tagText} />
        <Text style={[styles.emptyLabel, { color: palette.deckCore.tagText }]}>
          {DECK_CORE_COPY.noPhotos}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="adjustable"
      accessibilityLabel={DECK_CORE_COPY.photosLabel}
      accessibilityValue={{ text: DECK_CORE_COPY.photoLabel(page + 1, count) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && page < count - 1) {
          show(page + 1);
        } else if (event.nativeEvent.actionName === 'decrement' && page > 0) {
          show(page - 1);
        }
      }}
      style={[styles.frame, { backgroundColor: palette.surfaceVariant }]}
    >
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onScroll={onScroll}
        scrollEventThrottle={64}
        testID={`${testID}-scroll`}
      >
        {pictures.map((uri, index) => (
          <View key={`${uri}-${index}`} style={[styles.page, { width }]}>
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit={fit}
              cachePolicy="memory-disk"
              accessible={false}
              testID={`${testID}-page-${index + 1}`}
            />
          </View>
        ))}
      </ScrollView>
      {count > 1 ? (
        <View
          style={[styles.counter, { top: Math.max(24, topInset + 18) }]}
          testID={`${testID}-counter`}
        >
          <Text maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE} style={styles.counterLabel}>
            {DECK_CORE_COPY.photoCounter(page + 1, count)}
          </Text>
        </View>
      ) : null}
      {count > 1 ? (
        <View style={styles.dots}>
          {pictures.map((uri, index) => {
            const on = index === page;
            return (
              <Pressable
                key={`dot-${uri}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={DECK_CORE_COPY.showPhoto(index + 1)}
                accessibilityState={{ selected: on }}
                onPress={() => show(index)}
                hitSlop={8}
                testID={`${testID}-dot-${index + 1}`}
                style={styles.dotButton}
              >
                <View style={[styles.dot, on ? styles.dotOn : styles.dotOff]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: PHOTO_PAGER_HEIGHT, width: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyLabel: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  page: { height: PHOTO_PAGER_HEIGHT },
  counter: {
    position: 'absolute',
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 18, 16, 0.72)',
  },
  counterLabel: { color: '#F5F5F4', fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  dotButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3 },
  dotOn: { width: 18, backgroundColor: '#F5F5F4' },
  dotOff: { width: 6, backgroundColor: 'rgba(245, 245, 244, 0.45)' },
});
