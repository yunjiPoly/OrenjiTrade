import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { CardImage } from '@/src/components/ui/CardImage';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { manyRaritiesText, SCAN_COPY } from './scanCopy';
import { ScanPhotoImage } from './ScanPhotoImage';
import { matchRail, readText, type MatchRailItem } from './scanPrintings';
import { MAX_COPIES, MIN_COPIES, type ScanTile } from './scanSession';
import { SheetHeader, useLastValue } from './SheetParts';

/** "Your photo" and "Our match" (the mockup's 104 × 152). */
const PICTURE = { width: 104, height: 152 };
/** A tile of "Other matches" (the mockup's 60 × 86). */
const RAIL_PICTURE = { width: 56, height: 82 };

export interface CheckMatchSheetProps {
  /** The tile to check (found, or a code in several rarities picked in place); null: closed. */
  tile: ScanTile | null;
  onRemove: () => void;
  onClose: () => void;
  onCopies: (copies: number) => void;
  /** A rarity chip ("This code comes in {n} rarities. Pick yours."). */
  onRarity: (printingId: string) => void;
  /** A tile of "Other matches": it replaces the match. */
  onChoose: (item: MatchRailItem) => void;
  /** "Not here? Search". */
  onSearch: () => void;
}

/**
 * Check the match (mockup screen 28, a sheet over the camera or the review): "Remove" and Close,
 * "Your photo" next to "Our match" with the name, "{code} · {set}" and the rarity, what was read
 * from the photo, the copies (− {n} +), the rarity chips of a code in several rarities ("Done"
 * then reads "Pick a rarity" and stays off until one is picked), "Other matches" (a "Not here?
 * Search" tile first; picking one replaces the match) and "Done". Every change applies at once.
 */
export function CheckMatchSheet(props: CheckMatchSheetProps) {
  const visible = props.tile !== null && props.tile.card !== null;
  const shown = useLastValue(visible ? props.tile : null);
  return (
    <BottomSheet visible={visible} onClose={props.onClose} testID="scan-check-sheet">
      {shown ? <CheckMatch {...props} tile={shown} /> : null}
    </BottomSheet>
  );
}

function CheckMatch({
  tile,
  onRemove,
  onClose,
  onCopies,
  onRarity,
  onChoose,
  onSearch,
}: CheckMatchSheetProps & { tile: ScanTile }) {
  const { palette } = useTheme();
  const card = tile.card;
  const printing = tile.printing ?? null;
  const shownPrinting = printing ?? tile.rarities[0] ?? null;
  const many = tile.rarities.length > 1;
  const ready = tile.status === 'FOUND' && printing !== null;
  const read = readText(tile.read);
  const rail = matchRail(tile);
  const code = shownPrinting?.printingCode ?? shownPrinting?.setCode ?? '';
  const setName = shownPrinting?.setName ?? '';
  const rarity = printing?.rarity ?? (many ? '' : (shownPrinting?.rarity ?? ''));

  return (
    <View style={styles.body}>
      <SheetHeader
        title={SCAN_COPY.checkTitle}
        onRemove={onRemove}
        onClose={onClose}
        testID="scan-check"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.pictures}>
          <View style={styles.picture}>
            <ScanPhotoImage uri={tile.photos[0]?.uri} style={PICTURE} testID="scan-check-photo" />
            <Text style={[styles.caption, { color: palette.textMuted }]}>
              {SCAN_COPY.yourPhoto}
            </Text>
          </View>
          <View style={styles.picture}>
            <CardImage
              src={card?.imageUrl}
              alt={card?.name ?? ''}
              game="yugioh"
              size="md"
              style={PICTURE}
              testID="scan-check-match"
            />
            <Text style={[styles.caption, { color: palette.textMuted }]}>{SCAN_COPY.ourMatch}</Text>
          </View>
        </View>

        <View style={styles.match}>
          <View style={styles.matchTexts}>
            <Text style={[styles.name, { color: palette.ink }]} testID="scan-check-name">
              {card?.name}
            </Text>
            <Text style={[styles.code, { color: palette.textMuted }]} testID="scan-check-code">
              {[code, setName].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.tags}>
              {rarity ? (
                <Text
                  style={[
                    styles.rarity,
                    { backgroundColor: palette.surfaceVariant, color: palette.ink },
                  ]}
                  testID="scan-check-rarity"
                >
                  {rarity}
                </Text>
              ) : null}
              {read ? (
                <View
                  accessible
                  accessibilityLabel={`${SCAN_COPY.readFromPhoto}: ${read}`}
                  style={styles.read}
                  testID="scan-check-read"
                >
                  <MaterialCommunityIcons name="check" size={14} color={palette.accent} />
                  <Text style={[styles.readLabel, { color: palette.accent }]}>
                    {SCAN_COPY.readFromPhoto}
                  </Text>
                  <Text style={[styles.readText, { color: palette.textMuted }]}>{read}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Copies value={tile.copies} onChange={onCopies} />
        </View>

        {many ? (
          <View style={styles.section}>
            <Text style={[textStyle('sm'), { color: palette.warning }]}>
              {manyRaritiesText(tile.rarities.length)}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="radiogroup"
              accessibilityLabel={SCAN_COPY.rarityGroup}
              contentContainerStyle={styles.chips}
              testID="scan-check-rarities"
            >
              {tile.rarities.map((option) => {
                const checked = printing?.id === option.id;
                const label = option.rarity ?? option.setName;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    aria-checked={checked}
                    onPress={() => onRarity(option.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: checked ? palette.ink : palette.borderStrong,
                        backgroundColor: checked ? palette.ink : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}
                    testID={`scan-check-rarity-${option.id}`}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: checked ? palette.background : palette.ink },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>
            {SCAN_COPY.otherMatches.toUpperCase()}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            accessibilityLabel={SCAN_COPY.matchesGroup}
            contentContainerStyle={styles.rail}
            testID="scan-check-rail"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={SCAN_COPY.notHereLabel}
              onPress={onSearch}
              style={({ pressed }) => [styles.railItem, pressed && styles.pressed]}
              testID="scan-check-search"
            >
              <View style={[styles.searchTile, { borderColor: palette.textDisabled }]}>
                <MaterialCommunityIcons name="magnify" size={22} color={palette.primary} />
              </View>
              <Text style={[styles.railSearch, { color: palette.ink }]}>
                {`${SCAN_COPY.notHere}\n${SCAN_COPY.notHereSearch}`}
              </Text>
            </Pressable>
            {rail.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="radio"
                accessibilityLabel={[item.name, item.code, item.sub].filter(Boolean).join(', ')}
                aria-checked={item.checked}
                onPress={() => (item.checked ? undefined : onChoose(item))}
                style={({ pressed }) => [styles.railItem, pressed && styles.pressed]}
                testID={`scan-check-option-${item.key}`}
              >
                <View
                  style={[
                    styles.railFrame,
                    { borderColor: item.checked ? palette.primary : 'transparent' },
                  ]}
                >
                  <CardImage
                    src={item.imageUrl}
                    alt=""
                    game="yugioh"
                    size="sm"
                    style={RAIL_PICTURE}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.railCode,
                    { color: item.checked ? palette.ink : palette.textMuted },
                  ]}
                >
                  {item.code}
                </Text>
                <Text numberOfLines={2} style={[styles.railSub, { color: palette.textMuted }]}>
                  {item.sub}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
      <PillButton
        label={ready ? SCAN_COPY.done : SCAN_COPY.pickARarity}
        disabled={!ready}
        onPress={onClose}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="scan-check-done"
      />
    </View>
  );
}

/** "− {n} +": the copies of the card (1 to 99), the mockup's small stepper. */
function Copies({ value, onChange }: { value: number; onChange: (copies: number) => void }) {
  const { palette } = useTheme();
  const button = (label: string, icon: 'minus' | 'plus', next: number, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!enabled}
      disabled={!enabled}
      onPress={() => onChange(next)}
      style={({ pressed }) => [
        styles.copyButton,
        { backgroundColor: palette.surfaceVariant },
        pressed && styles.pressed,
      ]}
      testID={`scan-check-${icon === 'minus' ? 'less' : 'more'}`}
    >
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={enabled ? palette.ink : palette.textDisabled}
      />
    </Pressable>
  );
  return (
    <View
      style={[styles.copies, { backgroundColor: palette.background, borderColor: palette.border }]}
    >
      {button(SCAN_COPY.oneLess, 'minus', value - 1, value > MIN_COPIES)}
      <Text
        accessibilityLabel={`${SCAN_COPY.copies}: ${value}`}
        accessibilityLiveRegion="polite"
        style={[styles.copyValue, { color: palette.ink }]}
        testID="scan-check-copies"
      >
        {value}
      </Text>
      {button(SCAN_COPY.oneMore, 'plus', value + 1, value < MAX_COPIES)}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flexShrink: 1, gap: spacing[3] },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: spacing[3] },
  pictures: { flexDirection: 'row', justifyContent: 'center', gap: spacing[4] },
  picture: { alignItems: 'center', gap: 6 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  match: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  matchTexts: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 17, lineHeight: 21, fontWeight: fontWeight.bold },
  code: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 17 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  rarity: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  read: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  readLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  readText: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 15 },
  copies: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  copyButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyValue: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: fontWeight.bold },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
  },
  chips: { gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 13, lineHeight: 17, fontWeight: fontWeight.semibold },
  rail: { gap: 10, paddingVertical: 2 },
  railItem: { width: 64, alignItems: 'center', gap: 4 },
  searchTile: {
    width: 60,
    height: 86,
    borderRadius: 7,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railSearch: {
    fontSize: 10,
    lineHeight: 12.5,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  railFrame: { width: 60, height: 86, borderRadius: 7, borderWidth: 2, overflow: 'hidden' },
  railCode: { fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 13 },
  railSub: { fontSize: 10, lineHeight: 12.5, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
