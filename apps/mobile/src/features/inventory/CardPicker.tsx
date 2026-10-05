import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCardSuggestions } from '@/src/api/hooks/catalog';
import type { CardSuggestion } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { QUERY_MAX_LENGTH, SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_CHARS } from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface CardPickerProps {
  onPick: (suggestion: CardSuggestion) => void;
}

/**
 * "Find the card" (step 1 of adding a card): catalog autocomplete on `GET /cards/suggest`
 * (debounced, two letters at least): card names and printing codes; a printing suggestion
 * preselects that printing.
 */
export function CardPicker({ onPick }: CardPickerProps) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const suggestions = useCardSuggestions(query);
  const tooShort = query.length < SUGGEST_MIN_CHARS;

  let results;
  if (tooShort) {
    results = (
      <Text testID="card-picker-hint" style={[textStyle('sm'), { color: palette.textMuted }]}>
        Type at least two letters of the name, or a printing code like AZR-EN001.
      </Text>
    );
  } else if (suggestions.error && !suggestions.data) {
    results = (
      <View style={styles.status} testID="card-picker-error">
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          Suggestions are unavailable. Try again.
        </Text>
        <Button label="Try again" variant="secondary" onPress={() => void suggestions.refetch()} />
      </View>
    );
  } else if (!suggestions.data) {
    results = <SkeletonList rows={3} rowHeight={56} testID="card-picker-loading" />;
  } else if (suggestions.data.length === 0) {
    results = (
      <Text testID="card-picker-empty" style={[textStyle('sm'), { color: palette.textMuted }]}>
        No cards match “{query}”.
      </Text>
    );
  } else {
    results = (
      <View
        style={styles.list}
        accessibilityLabel={`${suggestions.data.length} suggestions`}
        testID="card-picker-results"
      >
        {suggestions.data.map((suggestion) => (
          <SuggestionRow
            key={`${suggestion.kind}:${suggestion.id}:${suggestion.printingId ?? ''}`}
            suggestion={suggestion}
            onPress={() => onPick(suggestion)}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TextField
        label="Card name or printing code"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
        maxLength={QUERY_MAX_LENGTH}
        testID="card-picker-input"
      />
      {results}
    </View>
  );
}

function SuggestionRow({
  suggestion,
  onPress,
}: {
  suggestion: CardSuggestion;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const name = suggestion.name ?? '';
  const game = suggestion.game ? gameLabel(suggestion.game) : '';
  const printing = suggestion.kind === 'PRINTING';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${suggestion.printingCode ? `, ${suggestion.printingCode}` : ''}${printing ? ', printing' : ''}`}
      onPress={onPress}
      testID={`suggestion-${suggestion.kind}-${suggestion.printingCode ?? suggestion.id}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <CardImage src={suggestion.imageUrl} alt="" game={suggestion.game} size="xs" />
      <View style={styles.text}>
        <Text style={[textStyle('md'), styles.name, { color: palette.ink }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
          {game}
          {suggestion.printingCode ? ' · ' : ''}
          {suggestion.printingCode ? (
            <Text style={styles.mono}>{suggestion.printingCode}</Text>
          ) : null}
        </Text>
      </View>
      {printing ? (
        <Text
          style={[
            textStyle('xs'),
            styles.kind,
            { color: palette.onAccentContainer, backgroundColor: palette.accentContainer },
          ]}
        >
          Printing
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  status: { gap: spacing[2], alignItems: 'flex-start' },
  list: { gap: spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1, gap: 2 },
  name: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  kind: {
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.8 },
});
