import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, textStyle, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { rarityListText, SCAN_COPY } from './scanCopy';
import type { ScanTile } from './scanSession';
import { SheetCancel, SheetSearchLink, useLastValue } from './SheetParts';

export interface RarityListSheetProps {
  /** The tile whose code comes in several rarities; null: the sheet is closed. */
  tile: ScanTile | null;
  onPick: (printingId: string) => void;
  /** "Search by name or code": the card itself is not the right one. */
  onSearch: () => void;
  onClose: () => void;
}

/**
 * The rarity list (mockup screen 27, a sheet): "Pick the rarity", "{name} · {code}. This code
 * comes in {n} rarities: pick the one on your card.", one row per rarity, "Search by name or code"
 * (the search is always one tap away, spec section 5) and Cancel.
 */
export function RarityListSheet({ tile, onPick, onSearch, onClose }: RarityListSheetProps) {
  const { palette } = useTheme();
  const visible = tile !== null && tile.rarities.length > 1;
  const shown = useLastValue(visible ? tile : null);
  return (
    <BottomSheet visible={visible} onClose={onClose} testID="scan-rarity-sheet">
      {shown ? (
        <View style={styles.body} accessibilityLabel={SCAN_COPY.rarityTitle}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
            style={[textStyle('lg'), styles.title, { color: palette.ink }]}
          >
            {SCAN_COPY.rarityTitle}
          </Text>
          {/* Twice its size at most, like a title: the rows and Cancel keep their room. */}
          <Text
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
            style={[textStyle('sm'), { color: palette.textMuted }]}
          >
            {rarityListText(shown)}
          </Text>
          <ScrollView
            accessibilityRole="radiogroup"
            accessibilityLabel={SCAN_COPY.rarityGroup}
            style={styles.list}
            testID="scan-rarity-list"
          >
            {shown.rarities.map((printing) => {
              const checked = shown.printing?.id === printing.id;
              const label = printing.rarity ?? printing.printingCode ?? printing.setName;
              return (
                <Pressable
                  key={printing.id}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  aria-checked={checked}
                  onPress={() => onPick(printing.id)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: palette.border },
                    pressed && styles.pressed,
                  ]}
                  testID={`scan-rarity-${printing.id}`}
                >
                  <View
                    style={[
                      styles.ring,
                      { borderColor: checked ? palette.primary : palette.textDisabled },
                    ]}
                  >
                    {checked ? (
                      <View style={[styles.dot, { backgroundColor: palette.primary }]} />
                    ) : null}
                  </View>
                  <Text
                    maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
                    style={[textStyle('md'), styles.label, { color: palette.ink }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <SheetSearchLink onPress={onSearch} testID="scan-rarity-search" />
          <SheetCancel onPress={onClose} testID="scan-rarity-cancel" />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[1], flexShrink: 1 },
  title: { fontWeight: fontWeight.bold, marginTop: spacing[1] },
  list: { flexGrow: 0, flexShrink: 1, marginTop: spacing[2] },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  ring: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { flex: 1 },
  pressed: { opacity: 0.7 },
});
