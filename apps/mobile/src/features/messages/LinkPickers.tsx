import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useMyBinders } from '@/src/api/hooks/binders';
import { fetchCard } from '@/src/api/hooks/catalog';
import type { BinderResponse, CardDetail, CardSuggestion } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { CardPicker } from '@/src/features/inventory/CardPicker';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import type { BinderLinkChoice, CardLinkChoice } from './messageDraft';

/** Height of an inline picker above the keyboard (the thread keeps the rest). */
const PICKER_MAX_HEIGHT = 280;

/**
 * The printing a suggestion stands for: a PRINTING suggestion names it; a CARD suggestion names
 * the card, so its printing with the suggested code is taken, else the first one (web:
 * `printingForSuggestion`).
 */
export function printingForSuggestion(
  suggestion: CardSuggestion,
  card: Pick<CardDetail, 'printings'> | null
): string | null {
  if (suggestion.kind === 'PRINTING' && suggestion.printingId) {
    return suggestion.printingId;
  }
  const printings = card?.printings ?? [];
  const byCode = suggestion.printingCode
    ? printings.find((printing) => printing.printingCode === suggestion.printingCode)
    : undefined;
  return (byCode ?? printings[0])?.id ?? null;
}

function PickerHeader({ title, onCancel }: { title: string; onCancel: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[textStyle('md'), styles.title, { color: palette.ink }]}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cancel: ${title.toLowerCase()}`}
        onPress={onCancel}
        hitSlop={8}
        testID="link-picker-cancel"
      >
        <MaterialCommunityIcons name="close" size={22} color={palette.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * "Share a card" (web: `app-card-link-picker`): a card name or printing code with autocomplete
 * (`GET /cards/suggest`); choosing a suggestion resolves the printing to link (a card suggestion
 * through `GET /cards/{id}`).
 */
export function CardLinkPicker({
  onPicked,
  onCancel,
}: {
  onPicked: (card: CardLinkChoice) => void;
  onCancel: () => void;
}) {
  const { palette } = useTheme();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const pick = async (suggestion: CardSuggestion) => {
    if (!suggestion.id || resolving) {
      return;
    }
    setError(null);
    let printingId = printingForSuggestion(suggestion, null);
    if (!printingId || suggestion.kind !== 'PRINTING') {
      setResolving(true);
      try {
        const card = await fetchCard(queryClient, suggestion.id);
        printingId = printingForSuggestion(suggestion, card);
      } catch {
        printingId = null;
      } finally {
        setResolving(false);
      }
    }
    if (!printingId) {
      setError('This card could not be shared. Try again.');
      return;
    }
    onPicked({
      printingId,
      cardId: suggestion.id,
      name: suggestion.name ?? 'Card',
      printingCode: suggestion.printingCode ?? null,
      imageUrl: suggestion.imageUrl ?? null,
      game: suggestion.game ?? null,
    });
  };

  return (
    <View style={styles.root} testID="card-link-picker">
      <PickerHeader title="Share a card" onCancel={onCancel} />
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <CardPicker onPick={(suggestion) => void pick(suggestion)} />
      </ScrollView>
      {resolving ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>Opening the card…</Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Public binders of the caller whose name contains `text` (case and accent insensitive). */
export function matchingBinders(
  binders: readonly BinderResponse[],
  text: string
): BinderResponse[] {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const needle = fold(text.trim());
  return binders.filter(
    (binder) => binder.effectivePublic && (!needle || fold(binder.name).includes(needle))
  );
}

/**
 * "Share a binder" (web: `app-binder-link-picker`): one of the caller's binders that is public
 * right now (`GET /binders`; only those can be linked), filtered by name.
 */
export function BinderLinkPicker({
  onPicked,
  onCancel,
}: {
  onPicked: (binder: BinderLinkChoice) => void;
  onCancel: () => void;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const binders = useMyBinders();
  const [text, setText] = useState('');
  const publicCount = useMemo(
    () => (binders.data ?? []).filter((binder) => binder.effectivePublic).length,
    [binders.data]
  );
  const options = useMemo(() => matchingBinders(binders.data ?? [], text), [binders.data, text]);

  let content;
  if (binders.error && !binders.data) {
    content = (
      <View style={styles.note} testID="binder-link-picker-error">
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          Your binders could not load.
        </Text>
        <Button label="Retry" variant="secondary" onPress={() => void binders.refetch()} />
      </View>
    );
  } else if (!binders.data) {
    content = <SkeletonList rows={2} rowHeight={48} testID="binder-link-picker-loading" />;
  } else if (publicCount === 0) {
    content = (
      <View style={styles.note} testID="binder-link-picker-empty">
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          You have no public binder yet. Publish one from your inventory first.
        </Text>
        <Button
          label="Open my binders"
          variant="secondary"
          onPress={() => router.push({ pathname: '/inventory', params: { view: 'binders' } })}
        />
      </View>
    );
  } else {
    content = (
      <>
        {publicCount > 5 ? (
          <TextField
            label="Binder name"
            value={text}
            onChangeText={setText}
            autoCorrect={false}
            testID="binder-link-picker-input"
          />
        ) : null}
        {options.length === 0 ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            No public binder matches “{text.trim()}”.
          </Text>
        ) : (
          options.map((binder) => (
            <Pressable
              key={binder.id}
              accessibilityRole="button"
              accessibilityLabel={`${binder.name}, ${binder.publicItemCount} public cards`}
              onPress={() =>
                onPicked({
                  binderId: binder.id,
                  name: binder.name,
                  itemCount: binder.publicItemCount,
                })
              }
              testID={`binder-option-${binder.id}`}
              style={({ pressed }) => [
                styles.option,
                { borderColor: palette.border, backgroundColor: palette.surface },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons name="book-open-variant" size={22} color={palette.primary} />
              <View style={styles.grow}>
                <Text style={[textStyle('md'), styles.title, { color: palette.ink }]}>
                  {binder.name}
                </Text>
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  {binder.publicItemCount} public {binder.publicItemCount === 1 ? 'card' : 'cards'}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </>
    );
  }

  return (
    <View style={styles.root} testID="binder-link-picker">
      <PickerHeader title="Share a binder" onCancel={onCancel} />
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <View style={styles.list}>{content}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: fontWeight.semibold },
  scroll: { maxHeight: PICKER_MAX_HEIGHT, flexGrow: 0 },
  list: { gap: spacing[2] },
  note: { gap: spacing[2], alignItems: 'flex-start' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
});
