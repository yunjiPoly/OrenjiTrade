import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCardSuggestions } from '@/src/api/hooks/catalog';
import type { CardSuggestion } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text, TextInput } from '@/src/components/ui/Text';
import {
  QUERY_MAX_LENGTH,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MIN_CHARS,
  suggestionVariant,
} from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { ADD_CARDS_COPY } from './inventoryCopy';

/** Suggestions asked for while typing: the cards and the exact printings of a code. */
export const ADD_SEARCH_LIMIT = 12;

export interface AddCardSearchProps {
  text: string;
  onText: (text: string) => void;
  /** "Cancel": back to Add cards. */
  onCancel: () => void;
  /** A card: Choose the printing (screen 5). */
  onCard: (suggestion: CardSuggestion) => void;
  /** An exact printing: Add to inventory (screen 6) at once. */
  onPrinting: (suggestion: CardSuggestion) => void;
}

/**
 * Add cards while typing (owner spec 2026-10-14, section 6, screen 4): the focused field with
 * Clear and Cancel; "Cards" (picture, name, "{game} · {n} printings"), which open Choose the
 * printing; "Exact printings" when the text looks like a code (code, set name, rarity), which go
 * straight to the details; and the hint at the bottom. Printings that share a code are each a row
 * of their own with what tells them apart ("1st Edition", "Unlimited"): the one tapped is added.
 */
export function AddCardSearch({ text, onText, onCancel, onCard, onPrinting }: AddCardSearchProps) {
  const { palette } = useTheme();
  const [query, setQuery] = useState(text.trim());

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const suggestions = useCardSuggestions(query, ADD_SEARCH_LIMIT, true);
  const cards = (suggestions.data ?? []).filter((entry) => entry.kind === 'CARD');
  const printings = (suggestions.data ?? []).filter((entry) => entry.kind === 'PRINTING');
  const tooShort = query.length < SUGGEST_MIN_CHARS;

  let results;
  if (tooShort) {
    results = null;
  } else if (suggestions.error && !suggestions.data) {
    results = (
      <View style={styles.status} testID="add-search-error">
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          {ADD_CARDS_COPY.loadError}
        </Text>
        <Button
          label="Try again"
          variant="secondary"
          onPress={() => void suggestions.refetch()}
          testID="add-search-retry"
        />
      </View>
    );
  } else if (!suggestions.data) {
    results = <SkeletonList rows={3} rowHeight={64} testID="add-search-loading" />;
  } else if (suggestions.data.length === 0) {
    results = (
      <View style={styles.status} testID="add-search-empty">
        <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
          {ADD_CARDS_COPY.noMatch(query)}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {ADD_CARDS_COPY.noMatchHint}
        </Text>
      </View>
    );
  } else {
    results = (
      <View style={styles.sections} testID="add-search-results">
        {cards.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title={ADD_CARDS_COPY.cardsSection} />
            {cards.map((card) => (
              <CardResult key={card.id} card={card} onPress={() => onCard(card)} />
            ))}
          </View>
        ) : null}
        {printings.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title={ADD_CARDS_COPY.printingsSection} />
            {printings.map((printing) => (
              <PrintingResult
                key={`${printing.printingId ?? printing.id}:${printing.printingCode ?? ''}`}
                printing={printing}
                variant={suggestionVariant(printing, printings)}
                onPress={() => onPrinting(printing)}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root} testID="add-cards-typing">
      <View style={styles.top}>
        <View
          style={[styles.field, { backgroundColor: palette.surface, borderColor: palette.primary }]}
        >
          <MaterialCommunityIcons name="magnify" size={22} color={palette.primary} />
          <TextInput
            value={text}
            onChangeText={onText}
            placeholder={ADD_CARDS_COPY.searchPlaceholder}
            placeholderTextColor={palette.textDisabled}
            accessibilityLabel={ADD_CARDS_COPY.searchLabel}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={QUERY_MAX_LENGTH}
            testID="add-search-input"
            style={[textStyle('md'), styles.input, { color: palette.ink }]}
          />
          {text ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ADD_CARDS_COPY.clear}
              onPress={() => onText('')}
              hitSlop={8}
              testID="add-search-clear"
              style={[styles.clear, { backgroundColor: palette.borderStrong }]}
            >
              <MaterialCommunityIcons name="close" size={16} color={palette.ink} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ADD_CARDS_COPY.cancel}
          onPress={onCancel}
          testID="add-search-cancel"
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[textStyle('md'), styles.strong, { color: palette.primary }]}
          >
            {ADD_CARDS_COPY.cancel}
          </Text>
        </Pressable>
      </View>
      {tooShort && text.trim().length > 0 ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {ADD_CARDS_COPY.tooShort}
        </Text>
      ) : null}
      {results}
      <View style={styles.grow} />
      <Text
        style={[styles.hint, { backgroundColor: palette.surface, color: palette.textMuted }]}
        testID="add-search-hint"
      >
        {ADD_CARDS_COPY.typingHint}
      </Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { palette } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.textMuted }]}>
      {title.toUpperCase()}
    </Text>
  );
}

function CardResult({ card, onPress }: { card: CardSuggestion; onPress: () => void }) {
  const { palette } = useTheme();
  const meta = ADD_CARDS_COPY.cardMeta(gameLabel(card.game ?? ''), card.printingCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name ?? ''}, ${meta}`}
      accessibilityHint="Opens its printings"
      onPress={onPress}
      testID={`add-card-${card.id}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <CardImage
        src={card.imageUrl}
        alt=""
        game={card.game}
        size="xs"
        style={[styles.art, { borderColor: palette.borderStrong }]}
      />
      <View style={styles.texts}>
        <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>{card.name}</Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{meta}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textMuted} />
    </Pressable>
  );
}

function PrintingResult({
  printing,
  variant,
  onPress,
}: {
  printing: CardSuggestion;
  /** What tells it apart from the other printings with its code; null when none shares it. */
  variant: string | null;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const spoken = [printing.printingCode, variant, printing.name, printing.setName, printing.rarity]
    .filter(Boolean)
    .join(', ');
  const code = printing.printingCode ?? printing.printingId;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the details to add it"
      onPress={onPress}
      testID={variant ? `add-printing-${code}-${printing.printingId}` : `add-printing-${code}`}
      style={({ pressed }) => [
        styles.printing,
        { borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.codeColumn}>
        <Text style={[styles.code, { color: palette.ink }]}>{printing.printingCode}</Text>
        {variant ? (
          <Text
            testID="add-printing-variant"
            style={[textStyle('xs'), styles.strong, { color: palette.ink }]}
          >
            {variant}
          </Text>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[textStyle('sm'), styles.set, { color: palette.textMuted }]}>
        {printing.setName ?? printing.name}
      </Text>
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
  root: { flexGrow: 1, gap: spacing[3] },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  field: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  input: { flex: 1, minHeight: 44, paddingVertical: 0 },
  clear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  strong: { fontWeight: fontWeight.semibold },
  status: { gap: spacing[2], alignItems: 'flex-start' },
  sections: { gap: spacing[3] },
  section: { gap: spacing[2] },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    marginHorizontal: 4,
  },
  card: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: 10,
  },
  art: { width: 40, height: 58, borderRadius: 5, borderWidth: 1 },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  printing: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  code: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
  codeColumn: { flexShrink: 0, gap: 2 },
  set: { flex: 1, minWidth: 0 },
  rarity: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  grow: { flexGrow: 1 },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingVertical: spacing[3],
    borderRadius: 12,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.8 },
});
