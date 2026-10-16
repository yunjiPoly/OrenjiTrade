import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCard } from '@/src/api/hooks/catalog';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text, TextInput } from '@/src/components/ui/Text';
import {
  fontFamily,
  fontWeight,
  spacing,
  textStyle,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { printingListCount, printingListText, SCAN_COPY } from './scanCopy';
import { printingsOfCard, rowRarity } from './scanPrintings';
import { filterPrintingRows, printingRows, type PrintingRow, type ScanTile } from './scanSession';
import { SheetCancel, useLastValue } from './SheetParts';
import type { CardScanPrinting } from './types';
import { useKeyboardHeight } from './useKeyboardHeight';

export interface PrintingListSheetProps {
  /** The tile whose card is known but not its printing; null: the sheet is closed. */
  tile: ScanTile | null;
  /** A code was picked: one rarity finds the tile; several open the rarity list next. */
  onPick: (row: PrintingRow, printings: readonly CardScanPrinting[]) => void;
  /** "search by name or code", when no printing has the code typed. */
  onSearch: () => void;
  onClose: () => void;
}

/**
 * The printings of the tile's card: the matcher's list, or, for a card picked by hand (an "Other
 * match" found by its name), the catalog's (`GET /cards/{id}`), English only, newest set first.
 */
function useTilePrintings(tile: ScanTile | null) {
  const own = tile?.printings ?? [];
  const card = useCard(tile && own.length === 0 ? tile.card?.id : null);
  const loaded = useMemo(() => (card.data ? printingsOfCard(card.data) : []), [card.data]);
  if (own.length > 0) {
    return { printings: own, loading: false, error: null, retry: () => undefined };
  }
  return {
    printings: loaded,
    loading: card.isPending && card.fetchStatus !== 'idle',
    error: card.error,
    retry: () => void card.refetch(),
  };
}

/**
 * The printing list (mockup screen 27, a sheet): "Pick the printing", "{name}. We couldn't read
 * its set code: type it from your card, or pick it below.", the field "Code on your card, like
 * MACR" that filters the list, "{n} printings, newest first" or "{n} of {total} printings", one
 * row per code (its set and its rarity, or "{n} rarities"), "No printing of this card has that
 * code…" when nothing is left, and Cancel.
 */
export function PrintingListSheet({ tile, onPick, onSearch, onClose }: PrintingListSheetProps) {
  const visible = tile !== null && tile.card !== null;
  const shown = useLastValue(visible ? tile : null);
  return (
    <BottomSheet visible={visible} onClose={onClose} testID="scan-printing-sheet">
      {shown ? (
        // A new tile starts with an empty field.
        <PrintingList
          key={shown.id}
          tile={shown}
          onPick={onPick}
          onSearch={onSearch}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

function PrintingList({
  tile,
  onPick,
  onSearch,
  onClose,
}: Omit<PrintingListSheetProps, 'tile'> & { tile: ScanTile }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [typed, setTyped] = useState('');
  const { printings, loading, error, retry } = useTilePrintings(tile);
  const rows = useMemo(() => printingRows(printings), [printings]);
  const filtered = useMemo(() => filterPrintingRows(rows, typed), [rows, typed]);
  const filtering = typed.trim().length > 0;

  let list;
  if (loading) {
    list = <SkeletonList rows={4} rowHeight={52} testID="scan-printing-loading" />;
  } else if (error) {
    list = (
      <ErrorState
        compact
        error={error}
        title={SCAN_COPY.printingsLoadFailed}
        onRetry={retry}
        testID="scan-printing-error"
      />
    );
  } else {
    list = (
      <>
        <Text
          style={[styles.count, { color: palette.textMuted }]}
          accessibilityLiveRegion="polite"
          testID="scan-printing-count"
        >
          {printingListCount(filtered.length, rows.length, filtering).toUpperCase()}
        </Text>
        <ScrollView
          accessibilityRole="list"
          accessibilityLabel={SCAN_COPY.printingsList}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          testID="scan-printing-list"
        >
          {filtered.map((row) => {
            const sub = rowRarity(row);
            return (
              <Pressable
                key={row.code}
                accessibilityRole="button"
                accessibilityLabel={[row.code, row.setName, sub].filter(Boolean).join(', ')}
                onPress={() => onPick(row, printings)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: palette.border },
                  pressed && styles.pressed,
                ]}
                testID={`scan-printing-row-${row.code}`}
              >
                <View style={styles.rowTexts}>
                  <Text style={[styles.code, { color: palette.ink }]}>{row.code}</Text>
                  <Text numberOfLines={2} style={[textStyle('xs'), { color: palette.textMuted }]}>
                    {row.setName}
                  </Text>
                </View>
                <Text style={[styles.sub, { color: palette.ink }]}>{sub}</Text>
              </Pressable>
            );
          })}
          {filtered.length === 0 ? (
            <Text
              style={[textStyle('sm'), styles.none, { color: palette.textMuted }]}
              testID="scan-printing-none"
            >
              {SCAN_COPY.noPrintingStart}
              <Text
                accessibilityRole="link"
                onPress={onSearch}
                style={[styles.link, { color: palette.primary }]}
                testID="scan-printing-search"
              >
                {SCAN_COPY.noPrintingLink}
              </Text>
              .
            </Text>
          ) : null}
        </ScrollView>
      </>
    );
  }

  return (
    <View style={styles.body}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
        style={[textStyle('lg'), styles.title, { color: palette.ink }]}
      >
        {SCAN_COPY.printingTitle}
      </Text>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{printingListText(tile)}</Text>
      <View
        style={[
          styles.field,
          { borderColor: palette.borderStrong, backgroundColor: palette.background },
        ]}
      >
        <MaterialCommunityIcons name="magnify" size={18} color={palette.textMuted} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          accessibilityLabel={SCAN_COPY.codeField}
          placeholder={SCAN_COPY.codePlaceholder}
          placeholderTextColor={palette.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="search"
          style={[styles.input, { color: palette.ink }]}
          testID="scan-printing-field"
        />
      </View>
      {list}
      <SheetCancel onPress={onClose} testID="scan-printing-cancel" />
      {/* The sheet rises above the keyboard (the sheet already keeps the home indicator's room). */}
      {keyboard > 0 ? <View style={{ height: Math.max(0, keyboard - insets.bottom) }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[1], flexShrink: 1 },
  title: { fontWeight: fontWeight.bold, marginTop: spacing[1] },
  field: {
    minHeight: 48,
    marginTop: spacing[2],
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  input: { flex: 1, minWidth: 0, fontFamily: fontFamily.mono, fontSize: 14, paddingVertical: 8 },
  count: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
  },
  list: { flexGrow: 0, flexShrink: 1 },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  rowTexts: { flex: 1, minWidth: 0, gap: 2 },
  code: { fontFamily: fontFamily.mono, fontSize: 14, lineHeight: 19 },
  sub: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  none: { paddingVertical: 12, paddingHorizontal: 4 },
  link: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
});
