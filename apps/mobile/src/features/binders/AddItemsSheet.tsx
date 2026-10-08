import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useBulkInventory, useInventoryItems } from '@/src/api/hooks/inventory';
import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { Checkbox } from '@/src/components/ui/FormControls';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { TextField } from '@/src/components/ui/TextField';
import { boundedQuery, printingCode, SEARCH_DEBOUNCE_MS } from '@/src/lib/catalog';
import { cardCount } from '@/src/lib/inventory';
import { DEFAULT_INVENTORY_FILTERS } from '@/src/lib/inventoryFilters';
import { spacing, textStyle, useTheme } from '@/src/theme';

export interface AddItemsSheetProps {
  binder: BinderResponse;
  visible: boolean;
  onClose: () => void;
  /** "Add a new card" (the add flow with this binder preselected). */
  onNewCard: () => void;
}

/**
 * "Add cards" to a binder: the collector's other cards (unfiled or in another binder) with
 * checkboxes, moved in one `POST /inventory/items/bulk` `MOVE_TO_BINDER` (web: the bulk bar's
 * "Move to binder").
 */
export function AddItemsSheet({ binder, visible, onClose, onNewCard }: AddItemsSheetProps) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const bulk = useBulkInventory();
  const filters = useMemo(() => ({ ...DEFAULT_INVENTORY_FILTERS, q, sort: 'name' as const }), [q]);
  const items = useInventoryItems(filters, visible);

  useEffect(() => {
    const timer = setTimeout(() => setQ(boundedQuery(text)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const close = () => {
    setSelected(new Set());
    setText('');
    onClose();
  };

  const candidates = useMemo(
    () =>
      (items.data?.pages.flatMap((page) => page.items ?? []) ?? []).filter(
        (item) => item.binder?.id !== binder.id
      ),
    [binder.id, items.data]
  );

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  const add = async () => {
    try {
      const result = await bulk.mutateAsync({
        action: 'MOVE_TO_BINDER',
        binderId: binder.id,
        itemIds: [...selected],
      });
      snackbar.show(`${cardCount(result.updated)} added to “${binder.name}”.`);
      close();
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  let list;
  if (!items.data && items.error) {
    list = (
      <View style={styles.status}>
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          {friendlyMessage(items.error)}
        </Text>
        <Button label="Try again" variant="secondary" onPress={() => void items.refetch()} />
      </View>
    );
  } else if (!items.data) {
    list = <SkeletonList rows={3} rowHeight={44} testID="add-items-loading" />;
  } else if (candidates.length === 0) {
    list = (
      <Text testID="add-items-empty" style={[textStyle('sm'), { color: palette.textMuted }]}>
        {q
          ? `None of your other cards match “${q}”.`
          : 'All your cards are already in this binder. Add a new card instead.'}
      </Text>
    );
  } else {
    list = candidates.map((item) => (
      <Checkbox
        key={item.id}
        label={`${item.card.name}, ${printingCode(item.printing)}${item.binder ? `, in ${item.binder.name}` : ', unfiled'}`}
        checked={selected.has(item.id)}
        onChange={(checked) => toggle(item.id, checked)}
        testID={`add-items-${item.id}`}
      >
        <View>
          <Text style={[textStyle('sm'), { color: palette.ink }]}>
            {item.card.name} · ×{item.quantity}
          </Text>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {printingCode(item.printing)} · {item.binder ? `in ${item.binder.name}` : 'unfiled'}
          </Text>
        </View>
      </Checkbox>
    ));
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={`Add cards to “${binder.name}”`}
      testID="add-items-sheet"
    >
      <TextField
        label="Search your cards"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        testID="add-items-search"
      />
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        Cards in another binder move here.
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        {list}
        {items.hasNextPage ? (
          <Button
            label="Show more"
            variant="ghost"
            loading={items.isFetchingNextPage}
            onPress={() => void items.fetchNextPage()}
            testID="add-items-more"
          />
        ) : null}
      </ScrollView>
      <View style={styles.actions}>
        <Button
          label="New card"
          icon="plus"
          variant="ghost"
          onPress={() => {
            setSelected(new Set());
            setText('');
            onNewCard();
          }}
          testID="add-items-new-card"
        />
        <Button
          label={selected.size > 0 ? `Add ${cardCount(selected.size)}` : 'Add cards'}
          loadingLabel="Adding…"
          loading={bulk.isPending}
          disabled={selected.size === 0}
          onPress={() => void add()}
          style={styles.grow}
          testID="add-items-submit"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, maxHeight: 320 },
  list: { gap: spacing[1] },
  status: { gap: spacing[2], alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: spacing[2] },
  grow: { flex: 1 },
});
