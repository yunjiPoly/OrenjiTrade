import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useInventoryItems } from '@/src/api/hooks/inventory';
import type { InventoryItemResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { InventoryCardRow } from '@/src/features/inventory/InventoryCardRow';
import {
  boundedQuery,
  printingCode,
  printingImageUrl,
  SEARCH_DEBOUNCE_MS,
} from '@/src/lib/catalog';
import { DEFAULT_INVENTORY_FILTERS } from '@/src/lib/inventoryFilters';
import { spacing, textStyle, useTheme } from '@/src/theme';

import type { OwnCardChoice } from './messageDraft';

const COPY = {
  title: 'Share a card from your inventory',
  search: 'Search your cards',
  empty: 'No cards match. Add your cards in Inventory first.',
  error: 'Your cards could not load.',
  retry: 'Try again',
  hint: 'It shows its picture, code and price, and this chat is about it from then on.',
} as const;

/** What a message keeps of one of the caller's cards. */
export function ownCardChoice(item: InventoryItemResponse): OwnCardChoice {
  return {
    itemId: item.id,
    name: item.card.name,
    printingCode: printingCode(item.printing) || null,
    imageUrl: printingImageUrl(item.printing),
    game: item.card.game ?? null,
    askingPriceText: item.askingPriceText ?? null,
  };
}

/**
 * "Share a card from your inventory" (the "+" sheet of a chat, owner spec 2026-10-14, section 10):
 * the collector's own cards (the Inventory's rows), searchable; the card picked goes into the
 * message box as an attachment, with its picture, code and price, and becomes the chat's subject
 * once sent (`CARD_LINK` with `inventoryItemId`). A private card is shown to this collector only.
 */
export function OwnCardPicker({
  visible,
  onPicked,
  onClose,
}: {
  visible: boolean;
  onPicked: (card: OwnCardChoice) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const next = boundedQuery(text);
    if (next === q) {
      return undefined;
    }
    const timer = setTimeout(() => setQ(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, text]);
  const filters = useMemo(() => ({ ...DEFAULT_INVENTORY_FILTERS, q }), [q]);
  const items = useInventoryItems(filters, visible);
  const rows = useMemo(
    () => items.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [items.data]
  );

  let content;
  if (!items.data && items.error) {
    content = (
      <View style={styles.note} testID="own-card-picker-error">
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          {COPY.error}
        </Text>
        <Button label={COPY.retry} variant="secondary" onPress={() => void items.refetch()} />
      </View>
    );
  } else if (!items.data) {
    content = <SkeletonList rows={3} rowHeight={64} testID="own-card-picker-loading" />;
  } else {
    content = (
      <FlatList
        testID="own-card-picker-list"
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => (
          <InventoryCardRow item={item} onPress={(picked) => onPicked(ownCardChoice(picked))} />
        )}
        onEndReached={() => {
          if (items.hasNextPage && !items.isFetchingNextPage) {
            void items.fetchNextPage();
          }
        }}
        ListEmptyComponent={
          <Text style={[textStyle('sm'), styles.empty, { color: palette.textMuted }]}>
            {COPY.empty}
          </Text>
        }
      />
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={COPY.title} testID="own-card-picker">
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{COPY.hint}</Text>
      <TextField
        label={COPY.search}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        testID="own-card-picker-search"
      />
      {content}
    </BottomSheet>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { maxHeight: 360 },
  separator: { height: spacing[2] },
  note: { gap: spacing[2] },
  empty: { paddingVertical: spacing[3] },
});
