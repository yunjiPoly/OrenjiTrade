import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { friendlyMessage } from '@/src/api/errorMessages';
import { useInventoryItems } from '@/src/api/hooks/inventory';
import type { InventoryItemResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { Checkbox } from '@/src/components/ui/FormControls';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { boundedQuery, printingCode, SEARCH_DEBOUNCE_MS } from '@/src/lib/catalog';
import { DEFAULT_INVENTORY_FILTERS } from '@/src/lib/inventoryFilters';
import { spacing, textStyle, useTheme } from '@/src/theme';

import { EDIT_BINDER_COPY } from './binderCopy';

export interface CardPickerSheetProps {
  visible: boolean;
  /** The binder being edited (its cards are not offered); none for a new binder. */
  binderId: string | null;
  /** Cards already picked and not saved yet (not offered again). */
  excluded: ReadonlySet<string>;
  /** A deck core: the hint says buyers see the cards with it. */
  deckCore: boolean;
  onPick: (items: InventoryItemResponse[]) => void;
  onClose: () => void;
}

/**
 * "Add cards" of Edit binder and New binder (spec 2026-10-14, section 7: "pick from your
 * inventory"): the collector's other cards (unfiled or in another binder) with checkboxes. Nothing
 * moves here: the picked cards join the binder's section and move with "Save changes".
 */
export function CardPickerSheet({
  visible,
  binderId,
  excluded,
  deckCore,
  onPick,
  onClose,
}: CardPickerSheetProps) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ReadonlyMap<string, InventoryItemResponse>>(new Map());
  const filters = useMemo(() => ({ ...DEFAULT_INVENTORY_FILTERS, q, sort: 'name' as const }), [q]);
  const items = useInventoryItems(filters, visible);

  useEffect(() => {
    const timer = setTimeout(() => setQ(boundedQuery(text)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const close = () => {
    setSelected(new Map());
    setText('');
    onClose();
  };

  const candidates = useMemo(
    () =>
      (items.data?.pages.flatMap((page) => page.items ?? []) ?? []).filter(
        (item) => item.binder?.id !== binderId && !excluded.has(item.id)
      ),
    [binderId, excluded, items.data]
  );

  const toggle = (item: InventoryItemResponse, checked: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      if (checked) {
        next.set(item.id, item);
      } else {
        next.delete(item.id);
      }
      return next;
    });

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
    list = <SkeletonList rows={3} rowHeight={44} testID="card-picker-loading" />;
  } else if (candidates.length === 0) {
    list = (
      <Text testID="card-picker-empty" style={[textStyle('sm'), { color: palette.textMuted }]}>
        {q ? EDIT_BINDER_COPY.pickerNoMatch(q) : EDIT_BINDER_COPY.pickerEmpty}
      </Text>
    );
  } else {
    list = candidates.map((item) => {
      const where = item.binder
        ? EDIT_BINDER_COPY.pickerInBinder(item.binder.name)
        : EDIT_BINDER_COPY.pickerUnfiled;
      return (
        <Checkbox
          key={item.id}
          label={`${item.card.name}, ${printingCode(item.printing)}, ${where}`}
          checked={selected.has(item.id)}
          onChange={(checked) => toggle(item, checked)}
          testID={`card-picker-${item.id}`}
        >
          <View>
            <Text style={[textStyle('sm'), { color: palette.ink }]}>
              {item.card.name} · ×{item.quantity}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {printingCode(item.printing)} · {where}
            </Text>
          </View>
        </Checkbox>
      );
    });
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={EDIT_BINDER_COPY.pickerTitle}
      testID="card-picker-sheet"
    >
      <TextField
        label={EDIT_BINDER_COPY.pickerSearch}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        testID="card-picker-search"
      />
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        {deckCore ? EDIT_BINDER_COPY.pickerCoreHint : EDIT_BINDER_COPY.pickerHint}
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        {list}
        {items.hasNextPage ? (
          <Button
            label={EDIT_BINDER_COPY.pickerMore}
            variant="ghost"
            loading={items.isFetchingNextPage}
            onPress={() => void items.fetchNextPage()}
            testID="card-picker-more"
          />
        ) : null}
      </ScrollView>
      <Button
        label={EDIT_BINDER_COPY.pickerAdd(selected.size)}
        disabled={selected.size === 0}
        onPress={() => {
          onPick([...selected.values()]);
          close();
        }}
        testID="card-picker-submit"
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, maxHeight: 320 },
  list: { gap: spacing[1] },
  status: { gap: spacing[2], alignItems: 'flex-start' },
});
