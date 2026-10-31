import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { BinderResponse } from '@/src/api/types';
import { Text } from '@/src/components/ui/Text';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { deckCoreTag, INVENTORY_BINDERS_COPY } from './binderCopy';
import { binderRowLine } from './binderForm';

/** The purple tag of a deck core ("Deck core · $180"), in the deckCore tokens. */
export function DeckCoreTag({
  label,
  size = 'small',
  testID,
}: {
  label: string;
  size?: 'small' | 'regular';
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.tag,
        size === 'regular' && styles.tagRegular,
        { backgroundColor: palette.deckCore.tagBackground },
      ]}
    >
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[
          size === 'regular' ? styles.tagLabelRegular : styles.tagLabel,
          { color: palette.deckCore.tagText },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/** A deck core's first photo (or a card picture), 56 pt square; a deck icon without any. */
export function CoreThumb({
  url,
  size = 56,
  style,
}: {
  url: string | null | undefined;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const uri = safeCardImageUrl(url);
  return (
    <View
      style={[
        styles.thumb,
        {
          width: size,
          height: size,
          backgroundColor: palette.deckCore.tagBackground,
          borderColor: palette.borderStrong,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessible={false}
        />
      ) : (
        <MaterialCommunityIcons name="cards-outline" size={24} color={palette.deckCore.tagText} />
      )}
    </View>
  );
}

/**
 * A fan of up to three card pictures (a binder in lists, mockup screens 14 and 17): the first in
 * front, the others tilted behind it; an empty card outline without pictures.
 */
export function CardFan({ urls }: { urls: readonly string[] }) {
  const { palette } = useTheme();
  const shown = urls.slice(0, 3);
  const back = shown.slice(1).reverse();
  const front = shown[0] ?? null;
  return (
    <View style={styles.fan} accessible={false}>
      {back.map((url, index) => (
        <FanCard
          key={`${url}-${index}`}
          url={url}
          style={[
            styles.fanBack,
            index === back.length - 1 ? styles.fanBackNear : styles.fanBackFar,
            { borderColor: palette.borderStrong },
          ]}
        />
      ))}
      {back.length === 0 ? (
        <View
          style={[
            styles.fanCard,
            styles.fanBack,
            styles.fanBackNear,
            { borderColor: palette.borderStrong, backgroundColor: palette.surfaceVariant },
          ]}
        />
      ) : null}
      <FanCard
        url={front}
        style={[styles.fanFront, { borderColor: palette.textDisabled }]}
        empty={front === null}
      />
    </View>
  );
}

function FanCard({
  url,
  style,
  empty = false,
}: {
  url: string | null;
  style: StyleProp<ViewStyle>;
  empty?: boolean;
}) {
  const { palette } = useTheme();
  const uri = safeCardImageUrl(url);
  return (
    <View style={[styles.fanCard, { backgroundColor: palette.surfaceVariant }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessible={false}
        />
      ) : empty ? (
        <MaterialCommunityIcons name="cards-outline" size={18} color={palette.textMuted} />
      ) : null}
    </View>
  );
}

export interface OwnBinderRowProps {
  binder: BinderResponse;
  onPress: (binder: BinderResponse) => void;
}

/**
 * A row of Inventory › Binders (screen 17). A deck core: its photo, its name, "{n} photos ·
 * Public" and the purple tag "Deck core · {price}", in a purple frame. A binder: a fan of three
 * cards, its name, "{n} cards · Public" or "· Private". The row opens Edit binder.
 */
export const OwnBinderRow = memo(function OwnBinderRow({ binder, onPress }: OwnBinderRowProps) {
  const { palette } = useTheme();
  const core = binder.sellsAsCore ?? false;
  const line = binderRowLine(binder);
  const tag = core ? deckCoreTag(binder.askingPriceText) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[binder.name, line, tag].filter(Boolean).join(', ')}
      accessibilityHint={INVENTORY_BINDERS_COPY.rowHint}
      onPress={() => onPress(binder)}
      testID={`binder-row-${binder.id}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.surface,
          borderColor: core ? palette.deckCore.border : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      {core ? (
        <CoreThumb url={binder.previewImages?.[0]} />
      ) : (
        <CardFan urls={binder.previewImages ?? []} />
      )}
      <View style={styles.text}>
        <Text
          numberOfLines={2}
          style={[styles.name, { color: palette.ink }]}
          testID={`binder-row-name-${binder.id}`}
        >
          {binder.name}
        </Text>
        <Text
          style={[styles.line, { color: palette.textMuted }]}
          testID={`binder-row-line-${binder.id}`}
        >
          {line}
        </Text>
        {tag ? <DeckCoreTag label={tag} testID={`binder-row-tag-${binder.id}`} /> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 44,
  },
  pressed: { opacity: 0.8 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  line: { fontSize: 13, lineHeight: 18 },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagRegular: { paddingHorizontal: 9, paddingVertical: 3 },
  tagLabel: { fontSize: 11, lineHeight: 15, fontWeight: fontWeight.bold },
  tagLabelRegular: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.bold },
  thumb: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fan: { width: 56, height: 64 },
  fanCard: {
    position: 'absolute',
    width: 40,
    height: 58,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanBack: { left: 0, top: 6 },
  fanBackNear: { transform: [{ rotate: '-8deg' }] },
  fanBackFar: { left: 4, top: 4, transform: [{ rotate: '-16deg' }] },
  fanFront: { left: 14, top: 2 },
});
