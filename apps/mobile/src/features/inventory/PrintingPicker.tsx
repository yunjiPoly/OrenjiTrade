import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { CardDetail, PrintingSummary } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text, TextInput } from '@/src/components/ui/Text';
import {
  editionLabel,
  finishLabel,
  languageName,
  printingCode,
  printingImageUrl,
} from '@/src/lib/catalog';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  textStyle,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { PRINTING_COPY } from './inventoryCopy';

export interface PrintingPickerProps {
  card: CardDetail;
  onPick: (printing: PrintingSummary) => void;
}

/** The release year of a printing's set ("2025"), or null when unknown. */
export function releaseYear(printing: PrintingSummary): string | null {
  const date = printing.setReleaseDate;
  return date && /^\d{4}/.test(date) ? date.slice(0, 4) : null;
}

/**
 * What tells apart printings that carry the same code (a first edition and an unlimited one of
 * "LOB-EN001", a reverse holo): their edition, language or finish when those differ; nothing for a
 * code no other printing has.
 */
export function printingVariant(
  printing: PrintingSummary,
  printings: readonly PrintingSummary[]
): string | null {
  const code = printingCode(printing);
  const twins = printings.filter(
    (other) => other.id !== printing.id && printingCode(other) === code
  );
  if (twins.length === 0) {
    return null;
  }
  const parts: string[] = [];
  if (twins.some((other) => other.edition !== printing.edition)) {
    parts.push(editionLabel(printing.edition));
  }
  if (twins.some((other) => other.language !== printing.language)) {
    parts.push(languageName(printing.language));
  }
  if (twins.some((other) => other.finish !== printing.finish)) {
    parts.push(finishLabel(printing.finish));
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The rarities of the printings, in the order they first appear. */
export function rarityChoices(printings: readonly PrintingSummary[]): string[] {
  const seen: string[] = [];
  for (const printing of printings) {
    const rarity = printing.rarity?.trim();
    if (rarity && !seen.includes(rarity)) {
      seen.push(rarity);
    }
  }
  return seen;
}

/** The printings a filter text ("Set code or set name") and a rarity keep. */
export function filterPrintings(
  printings: readonly PrintingSummary[],
  text: string,
  rarity: string | null
): PrintingSummary[] {
  const needle = text.trim().toLowerCase();
  return printings.filter((printing) => {
    if (rarity && printing.rarity?.trim() !== rarity) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return [printingCode(printing), printing.setCode, printing.setName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
}

/**
 * Choose the printing (owner spec 2026-10-14, section 6, screen 5): the card's name, "{n}
 * printings. Pick the one on your card.", a filter by set code or set name, rarity chips, and one
 * row per printing (code in mono, "{set} · {year}", rarity) that opens Add to inventory.
 */
export function PrintingPicker({ card, onPick }: PrintingPickerProps) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [rarity, setRarity] = useState<string | null>(null);
  const printings = useMemo(() => card.printings ?? [], [card.printings]);
  const rarities = useMemo(() => rarityChoices(printings), [printings]);
  const shown = useMemo(() => filterPrintings(printings, text, rarity), [printings, text, rarity]);

  return (
    <View style={styles.root} testID="printing-picker">
      <View style={styles.head}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.name, { color: palette.ink }]}
          testID="printing-picker-name"
        >
          {card.name}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="printing-count">
          {PRINTING_COPY.count(printings.length)}
        </Text>
      </View>

      {printings.length > 3 ? (
        <View
          style={[styles.filter, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <MaterialCommunityIcons name="magnify" size={18} color={palette.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={PRINTING_COPY.filterPlaceholder}
            placeholderTextColor={palette.textDisabled}
            accessibilityLabel={PRINTING_COPY.filterLabel}
            autoCapitalize="none"
            autoCorrect={false}
            testID="printing-filter"
            style={[textStyle('md'), styles.input, { color: palette.ink }]}
          />
        </View>
      ) : null}

      {rarities.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel={PRINTING_COPY.rarityLabel}
        >
          {[null, ...rarities].map((value) => {
            const on = value === rarity;
            const label = value ?? PRINTING_COPY.allRarities;
            return (
              <Pressable
                key={value ?? 'all'}
                accessibilityRole="radio"
                accessibilityLabel={label}
                aria-checked={on}
                onPress={() => setRarity(value)}
                hitSlop={{ top: 6, bottom: 6 }}
                testID={`printing-rarity-${value ?? 'all'}`}
                style={({ pressed }) => [
                  styles.chip,
                  on
                    ? { backgroundColor: palette.ink, borderColor: palette.ink }
                    : { borderColor: palette.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                  style={[styles.chipLabel, { color: on ? palette.background : palette.ink }]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.list} testID="printing-list">
        {shown.length === 0 ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="printing-none">
            {PRINTING_COPY.none}
          </Text>
        ) : (
          shown.map((printing) => (
            <PrintingRow
              key={printing.id}
              printing={printing}
              variant={printingVariant(printing, printings)}
              game={card.game}
              onPress={() => onPick(printing)}
            />
          ))
        )}
      </View>
    </View>
  );
}

function PrintingRow({
  printing,
  variant,
  game,
  onPress,
}: {
  printing: PrintingSummary;
  variant: string | null;
  game: string | null | undefined;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const code = printingCode(printing);
  const setLine = [PRINTING_COPY.setAndYear(printing.setName ?? '', releaseYear(printing)), variant]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[code, setLine, printing.rarity].filter(Boolean).join(', ')}
      onPress={onPress}
      testID={`printing-${code}${variant ? `-${printing.id}` : ''}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <CardImage
        src={printingImageUrl(printing)}
        alt=""
        game={game}
        size="xs"
        style={[styles.art, { borderColor: palette.borderStrong }]}
      />
      <View style={styles.texts}>
        <Text style={[styles.code, { color: palette.ink }]}>{code}</Text>
        <Text numberOfLines={2} style={[textStyle('sm'), { color: palette.textMuted }]}>
          {setLine}
        </Text>
      </View>
      {printing.rarity ? (
        <Text
          style={[styles.rarity, { backgroundColor: palette.surfaceVariant, color: palette.ink }]}
        >
          {printing.rarity}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  head: { gap: 2 },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  filter: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  input: { flex: 1, minHeight: 42, paddingVertical: 0 },
  chips: { gap: spacing[2], paddingVertical: 6 },
  chip: {
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  list: { gap: spacing[2] },
  row: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    paddingLeft: spacing[2],
    paddingRight: spacing[3],
  },
  art: { width: 40, height: 58, borderRadius: 5, borderWidth: 1 },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  code: { fontFamily: fontFamily.mono, fontSize: 14, lineHeight: 19 },
  rarity: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.8 },
});
