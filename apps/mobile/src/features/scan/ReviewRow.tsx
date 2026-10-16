import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  type Palette,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { REVIEW_COPY, SCAN_COPY, TILE_STATUS_TEXT } from './scanCopy';
import { ScanPhotoImage } from './ScanPhotoImage';
import { reviewRowKind, type ReviewRowKind } from './scanReview';
import { MAX_COPIES, MIN_COPIES, type ScanTile } from './scanSession';

/** The picture of a row (the mockup's 44 × 64 card). */
const PICTURE = { width: 44, height: 64 };
/** The small buttons of a row are drawn 36 points wide; their touch reaches 44. */
const SMALL = 36;
const SLOP = { top: 4, bottom: 4, left: 4, right: 4 };
/**
 * A row's words follow the text size up to twice their size, like a screen's title: past it, a
 * long word of a card's name ("Majespecter") no longer fits its column and would be broken.
 */
const ROW_TEXT_SCALE = TITLE_MAX_FONT_SCALE;

export interface ReviewRowProps {
  tile: ScanTile;
  /** A ready row opens 28; a row to check opens its fix (the rarity or printing list). */
  onOpen: (tile: ScanTile) => void;
  /** "Search by name or code" (a card that could not be read). */
  onSearch: (tile: ScanTile) => void;
  /** "Try again" (a card waiting for the connection): its match is asked for again. */
  onRetry: (tile: ScanTile) => void;
  onCopies: (tile: ScanTile, copies: number) => void;
  onRemove: (tile: ScanTile) => void;
}

/** The border of a row, from the mockup mapped to the R1 tokens (the tray's colours). */
function rowBorder(kind: ReviewRowKind, palette: Palette): string {
  switch (kind) {
    case 'READY':
      return palette.border;
    case 'PICK_RARITY':
    case 'PICK_PRINTING':
      return `${palette.warning}66`;
    case 'UNREAD':
      return palette.primaryContainer;
    default:
      return palette.borderStrong;
  }
}

/**
 * One card of the review (mockup screen 30): its picture, name, code and rarity, "− copies +" and
 * Remove. A ready row opens 28 (Check the match); a row to check shows its fix: "Pick rarity",
 * "Pick printing" under "Set code not readable", or "Search by name or code". A row still waiting
 * for the connection says so and offers "Try again". Past the pinned text size, the copies go
 * under the name.
 */
export function ReviewRow({ tile, onOpen, onSearch, onRetry, onCopies, onRemove }: ReviewRowProps) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const kind = reviewRowKind(tile);
  const name =
    kind === 'UNREAD'
      ? REVIEW_COPY.couldntRead
      : kind === 'WAITING'
        ? TILE_STATUS_TEXT.WAITING
        : (tile.card?.name ?? '');
  const stacked = (fontScale || 1) > PINNED_MAX_FONT_SCALE;
  const hasCopies = kind === 'READY' || kind === 'PICK_RARITY' || kind === 'PICK_PRINTING';

  const picture =
    kind === 'UNREAD' || kind === 'WAITING' ? (
      <ScanPhotoImage
        uri={tile.photos[0]?.uri}
        blurred={kind === 'UNREAD'}
        style={PICTURE}
        testID={`review-row-${tile.id}-photo`}
      />
    ) : (
      <CardImage
        src={tile.card?.imageUrl}
        alt=""
        game="yugioh"
        size="xs"
        style={PICTURE}
        testID={`review-row-${tile.id}-picture`}
      />
    );

  const texts = (
    <View style={styles.texts}>
      <Text maxFontSizeMultiplier={ROW_TEXT_SCALE} style={[styles.name, { color: palette.ink }]}>
        {name}
      </Text>
      <Details tile={tile} kind={kind} onOpen={onOpen} onSearch={onSearch} onRetry={onRetry} />
    </View>
  );

  const left =
    kind === 'READY' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={REVIEW_COPY.checkMatchFor(name)}
        accessibilityValue={{
          text: [tile.printing?.printingCode, tile.printing?.rarity].filter(Boolean).join(', '),
        }}
        onPress={() => onOpen(tile)}
        style={({ pressed }) => [styles.left, pressed && styles.pressed]}
        testID={`review-row-${tile.id}-open`}
      >
        {picture}
        {texts}
      </Pressable>
    ) : (
      <View style={styles.left}>
        {picture}
        {texts}
      </View>
    );

  const copies = hasCopies ? (
    <Copies tile={tile} onChange={(value) => onCopies(tile, value)} />
  ) : null;
  const remove = (
    <Pressable
      accessibilityRole="button"
      // A row with no card yet is not named after its status ("Remove Couldn't read").
      accessibilityLabel={
        kind === 'UNREAD' || kind === 'WAITING'
          ? REVIEW_COPY.removeThisCard
          : REVIEW_COPY.remove(name)
      }
      onPress={() => onRemove(tile)}
      hitSlop={SLOP}
      style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
      testID={`review-row-${tile.id}-remove`}
    >
      <MaterialCommunityIcons name="close" size={18} color={palette.textMuted} />
    </Pressable>
  );

  const frame = [
    styles.row,
    { backgroundColor: palette.surface, borderColor: rowBorder(kind, palette) },
  ];
  if (stacked) {
    return (
      <View style={[frame, styles.column]} testID={`review-row-${tile.id}`}>
        <View style={styles.line}>
          {left}
          {remove}
        </View>
        {copies ? <View style={styles.under}>{copies}</View> : null}
      </View>
    );
  }
  return (
    <View style={[frame, styles.line]} testID={`review-row-${tile.id}`}>
      {left}
      {copies}
      {remove}
    </View>
  );
}

/** The second line: the code and rarity, or the fix the row needs. */
function Details({
  tile,
  kind,
  onOpen,
  onSearch,
  onRetry,
}: {
  tile: ScanTile;
  kind: ReviewRowKind;
  onOpen: (tile: ScanTile) => void;
  onSearch: (tile: ScanTile) => void;
  onRetry: (tile: ScanTile) => void;
}) {
  const { palette } = useTheme();
  const code = (value: string | null | undefined): ReactNode =>
    value ? (
      <Text
        maxFontSizeMultiplier={ROW_TEXT_SCALE}
        style={[styles.code, { color: palette.textMuted }]}
      >
        {value}
      </Text>
    ) : null;
  switch (kind) {
    case 'READY':
      return (
        <View style={styles.details}>
          {code(tile.printing?.printingCode ?? tile.printing?.setCode)}
          {tile.printing?.rarity ? (
            <Text
              maxFontSizeMultiplier={ROW_TEXT_SCALE}
              style={[
                styles.rarity,
                { backgroundColor: palette.surfaceVariant, color: palette.ink },
              ]}
            >
              {tile.printing.rarity}
            </Text>
          ) : null}
        </View>
      );
    case 'PICK_RARITY':
      return (
        <View style={styles.details}>
          {code(tile.rarities[0]?.printingCode)}
          <FixButton
            label={REVIEW_COPY.pickRarity}
            onPress={() => onOpen(tile)}
            testID={`review-row-${tile.id}-pick-rarity`}
          />
        </View>
      );
    case 'PICK_PRINTING':
      return (
        <View style={styles.details}>
          <Text
            maxFontSizeMultiplier={ROW_TEXT_SCALE}
            style={[styles.unreadable, { color: palette.textMuted }]}
          >
            {REVIEW_COPY.codeUnreadable}
          </Text>
          <FixButton
            label={REVIEW_COPY.pickPrinting}
            onPress={() => onOpen(tile)}
            testID={`review-row-${tile.id}-pick-printing`}
          />
        </View>
      );
    case 'UNREAD':
      return (
        <TextButton
          label={REVIEW_COPY.searchByNameOrCode}
          onPress={() => onSearch(tile)}
          testID={`review-row-${tile.id}-search`}
        />
      );
    case 'WAITING':
      return (
        <TextButton
          label={REVIEW_COPY.tryAgain}
          onPress={() => onRetry(tile)}
          testID={`review-row-${tile.id}-retry`}
        />
      );
    default:
      return null;
  }
}

/** "Search by name or code" / "Try again": a word in the accent colour, 44 points tall. */
function TextButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.search, pressed && styles.pressed]}
      testID={testID}
    >
      <Text
        maxFontSizeMultiplier={ROW_TEXT_SCALE}
        style={[styles.searchLabel, { color: palette.primary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** "Pick rarity" / "Pick printing": the amber pill with its chevron. */
function FixButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={SLOP}
      style={({ pressed }) => [
        styles.fix,
        { borderColor: `${palette.warning}66`, backgroundColor: `${palette.warning}1F` },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Text
        maxFontSizeMultiplier={ROW_TEXT_SCALE}
        style={[styles.fixLabel, { color: palette.warning }]}
      >
        {label}
      </Text>
      <MaterialCommunityIcons name="chevron-down" size={14} color={palette.warning} />
    </Pressable>
  );
}

/** "− {n} +": the copies of a row (1 to 99), the mockup's small stepper. */
function Copies({ tile, onChange }: { tile: ScanTile; onChange: (copies: number) => void }) {
  const { palette } = useTheme();
  const value = tile.copies;
  const button = (label: string, icon: 'minus' | 'plus', next: number, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!enabled}
      disabled={!enabled}
      onPress={() => onChange(next)}
      hitSlop={SLOP}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: palette.surfaceVariant },
        pressed && styles.pressed,
      ]}
      testID={`review-row-${tile.id}-${icon === 'minus' ? 'less' : 'more'}`}
    >
      <MaterialCommunityIcons
        name={icon}
        size={16}
        color={enabled ? palette.ink : palette.textDisabled}
      />
    </Pressable>
  );
  return (
    <View style={styles.copies}>
      {button(SCAN_COPY.oneLess, 'minus', value - 1, value > MIN_COPIES)}
      <Text
        accessibilityLabel={`${SCAN_COPY.copies}: ${value}`}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.copyValue, { color: palette.ink }]}
        testID={`review-row-${tile.id}-copies`}
      >
        {value}
      </Text>
      {button(SCAN_COPY.oneMore, 'plus', value + 1, value < MAX_COPIES)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 14, borderWidth: 1, padding: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  column: { gap: 8 },
  under: { flexDirection: 'row', justifyContent: 'flex-end' },
  left: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  texts: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.semibold },
  details: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  code: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 },
  rarity: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  unreadable: { fontSize: 12, lineHeight: 16 },
  fix: {
    minHeight: SMALL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: SMALL / 2,
    borderWidth: 1,
  },
  fixLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.bold },
  search: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  searchLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  copies: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  step: {
    width: SMALL,
    height: SMALL,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
  },
  remove: {
    width: SMALL,
    height: SMALL,
    borderRadius: SMALL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
