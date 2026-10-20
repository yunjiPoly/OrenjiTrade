import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

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
import { PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

import { EDIT_BINDER_COPY } from './binderCopy';

export interface CardPickerSheetProps {
  visible: boolean;
  /** The binder being edited (its cards are not offered); none for a new binder. */
  binderId: string | null;
  /** Cards already picked and not saved yet (not offered again). */
  excluded: ReadonlySet<string>;
  /** A deck core: the hint says buyers see the cards with it. */
  deckCore: boolean;
  /**
   * The binder's game (stage G): only its cards are offered, and the hint says so with its name
   * ("Only your Yu-Gi-Oh! cards can go in").
   */
  game?: { slug: string; name: string } | null;
  onPick: (items: InventoryItemResponse[]) => void;
  onClose: () => void;
}

/**
 * "Add cards" of Edit binder and New binder (spec 2026-10-14, section 7: "pick from your
 * inventory"): the collector's other cards (unfiled or in another binder) with checkboxes. Nothing
 * moves here: the picked cards join the binder's section and move with "Save changes".
 *
 * At large text sizes the search field and the hint scroll with the cards: kept above them, they
 * filled the sheet at the largest size and pushed the cards and "Add {n} cards" off the screen
 * (review fix 2 of stage R3). The button stays under the list at every size.
 */
export function CardPickerSheet({
  visible,
  binderId,
  excluded,
  deckCore,
  game = null,
  onPick,
  onClose,
}: CardPickerSheetProps) {
  const { palette } = useTheme();
  const large = useWindowDimensions().fontScale > 1.3;
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ReadonlyMap<string, InventoryItemResponse>>(new Map());
  const gameSlug = game?.slug ?? null;
  const filters = useMemo(
    () => ({ ...DEFAULT_INVENTORY_FILTERS, q, sort: 'name' as const, game: gameSlug }),
    [q, gameSlug]
  );
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
        (item) =>
          item.binder?.id !== binderId &&
          !excluded.has(item.id) &&
          (!gameSlug || item.card.game === gameSlug)
      ),
    [binderId, excluded, gameSlug, items.data]
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

  const search = (
    <View style={styles.search} testID="card-picker-search-area">
      <TextField
        label={EDIT_BINDER_COPY.pickerSearch}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        testID="card-picker-search"
      />
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        {deckCore
          ? EDIT_BINDER_COPY.pickerCoreHint
          : game
            ? EDIT_BINDER_COPY.pickerGameHint(game.name)
            : EDIT_BINDER_COPY.pickerHint}
      </Text>
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={EDIT_BINDER_COPY.pickerTitle}
      testID="card-picker-sheet"
    >
      {large ? null : search}
      <ScrollView
        style={large ? styles.scrollLarge : styles.scroll}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        testID="card-picker-list"
      >
        {large ? search : null}
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
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
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
  search: { gap: spacing[3] },
  scroll: { flexGrow: 0, flexShrink: 1, maxHeight: 320 },
  // Large text: the list takes what the sheet has left under its title, above the button.
  scrollLarge: { flexGrow: 0, flexShrink: 1 },
  list: { gap: spacing[1] },
  status: { gap: spacing[2], alignItems: 'flex-start' },
});
