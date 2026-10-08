import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useInventoryItems } from '@/src/api/hooks/inventory';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Stepper } from '@/src/components/ui/Stepper';
import { TextField } from '@/src/components/ui/TextField';
import { SEARCH_DEBOUNCE_MS } from '@/src/lib/catalog';
import { conditionLabel } from '@/src/lib/inventory';
import { DEFAULT_INVENTORY_FILTERS } from '@/src/lib/inventoryFilters';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { tradeLineFromInventory, type TradeLine } from './offerForm';
import { OFFER_QUANTITY_MAX, OFFER_TRADE_ITEMS_MAX } from './offerLabels';

const SEARCH_MAX = 80;

/**
 * The cards of a proposal (web: `app-offer-card-picker`): the chosen cards with a copy stepper
 * and a remove button, then either the caller's inventory to pick from (`inventory` mode: a
 * buyer, private cards included, up to 10 different cards) or, for a seller's counter-offer
 * (`proposal` mode), the buyer's cards that were removed and can be put back.
 */
export function TradeCardPicker({
  lines,
  mode,
  pool = [],
  disabled = false,
  onChange,
}: {
  lines: readonly TradeLine[];
  mode: 'inventory' | 'proposal';
  pool?: readonly TradeLine[];
  disabled?: boolean;
  onChange: (lines: TradeLine[]) => void;
}) {
  const { palette } = useTheme();
  const chosen = new Set(lines.map((line) => line.inventoryItemId));
  const full = lines.length >= OFFER_TRADE_ITEMS_MAX;

  const add = (line: TradeLine) => {
    if (chosen.has(line.inventoryItemId) || full) {
      return;
    }
    onChange([...lines, { ...line }]);
  };
  const remove = (line: TradeLine) =>
    onChange(lines.filter((candidate) => candidate.inventoryItemId !== line.inventoryItemId));
  const setQuantity = (line: TradeLine, quantity: number) =>
    onChange(
      lines.map((candidate) =>
        candidate.inventoryItemId === line.inventoryItemId ? { ...candidate, quantity } : candidate
      )
    );

  return (
    <View style={styles.root} testID="offer-card-picker">
      {lines.length > 0 ? (
        <View style={styles.list} accessibilityLabel="Cards in your offer">
          {lines.map((line) => (
            <View
              key={line.inventoryItemId}
              style={[styles.chosen, { borderColor: palette.border }]}
              testID={`offer-line-${line.inventoryItemId}`}
            >
              <View style={styles.row}>
                <CardImage src={line.imageUrl} alt="" game={line.game} size="xs" />
                <View style={styles.grow}>
                  <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
                    {line.cardName}
                  </Text>
                  <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                    {line.printingCode ? (
                      <Text style={styles.mono}>{line.printingCode} · </Text>
                    ) : null}
                    {conditionLabel(line.condition)} · {line.maxQuantity} held
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.cardName} from the offer`}
                  disabled={disabled}
                  hitSlop={8}
                  onPress={() => remove(line)}
                  testID={`offer-line-remove-${line.inventoryItemId}`}
                  style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
                </Pressable>
              </View>
              {line.maxQuantity > 1 ? (
                <Stepper
                  label="Copies"
                  value={line.quantity}
                  min={1}
                  max={Math.min(OFFER_QUANTITY_MAX, line.maxQuantity)}
                  disabled={disabled}
                  onChange={(value) => setQuantity(line, value)}
                  testID={`offer-line-quantity-${line.inventoryItemId}`}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {mode === 'proposal' ? (
        <ProposalPool pool={pool} chosen={chosen} disabled={disabled} onAdd={add} />
      ) : (
        <InventorySearch chosen={chosen} full={full} disabled={disabled} onAdd={add} />
      )}
    </View>
  );
}

function ProposalPool({
  pool,
  chosen,
  disabled,
  onAdd,
}: {
  pool: readonly TradeLine[];
  chosen: Set<string>;
  disabled: boolean;
  onAdd: (line: TradeLine) => void;
}) {
  const { palette } = useTheme();
  const removed = pool.filter((line) => !chosen.has(line.inventoryItemId));
  if (removed.length > 0) {
    return (
      <View style={styles.list}>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Put back a card of the proposal:
        </Text>
        {removed.map((line) => (
          <View key={line.inventoryItemId} style={styles.row}>
            <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
              {line.cardName}
            </Text>
            <Button
              label="Put back"
              icon="undo"
              variant="ghost"
              disabled={disabled}
              accessibilityLabel={`Put back ${line.cardName}`}
              onPress={() => onAdd(line)}
              testID={`offer-put-back-${line.inventoryItemId}`}
            />
          </View>
        ))}
      </View>
    );
  }
  if (pool.length === 0) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        Only the buyer&apos;s cards can be part of the deal, and this proposal has none. Answer with
        cash, or decline.
      </Text>
    );
  }
  return null;
}

function InventorySearch({
  chosen,
  full,
  disabled,
  onAdd,
}: {
  chosen: Set<string>;
  full: boolean;
  disabled: boolean;
  onAdd: (line: TradeLine) => void;
}) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const filters = useMemo(() => ({ ...DEFAULT_INVENTORY_FILTERS, q, sort: 'name' as const }), [q]);
  const items = useInventoryItems(filters);
  const results = items.data?.pages[0]?.items ?? [];

  let body;
  if (items.error && !items.data) {
    body = (
      <View style={styles.row} testID="offer-cards-error">
        <Text
          accessibilityRole="alert"
          style={[textStyle('sm'), styles.grow, { color: palette.danger }]}
        >
          Your cards could not load.
        </Text>
        <Button label="Retry" variant="ghost" onPress={() => void items.refetch()} />
      </View>
    );
  } else if (!items.data) {
    body = <SkeletonList rows={2} rowHeight={56} testID="offer-cards-loading" />;
  } else if (results.length === 0) {
    body = (
      <Text testID="offer-cards-empty" style={[textStyle('sm'), { color: palette.textMuted }]}>
        {q ? 'No card of yours matches.' : 'Your inventory is empty.'}
      </Text>
    );
  } else {
    body = (
      <View style={styles.list} accessibilityLabel="Your cards">
        {results.map((item) => {
          const line = tradeLineFromInventory(item);
          const added = chosen.has(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={
                added
                  ? `${item.card.name}, added to the offer`
                  : `Add ${item.card.name} to the offer`
              }
              accessibilityState={{ disabled: disabled || added || full, selected: added }}
              disabled={disabled || added || full}
              onPress={() => onAdd(line)}
              testID={`offer-pick-${item.id}`}
              style={({ pressed }) => [
                styles.result,
                { borderColor: palette.border },
                pressed && styles.pressed,
              ]}
            >
              <CardImage src={line.imageUrl} alt="" game={item.card.game} size="xs" />
              <View style={styles.grow}>
                <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
                  {item.card.name}
                </Text>
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  {line.printingCode ? (
                    <Text style={styles.mono}>{line.printingCode} · </Text>
                  ) : null}
                  {conditionLabel(item.condition)} · ×{item.quantity}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={added ? 'check' : 'plus-circle-outline'}
                size={22}
                color={added ? palette.success : palette.accent}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <TextField
        label="Search your inventory"
        value={text}
        onChangeText={setText}
        maxLength={SEARCH_MAX}
        autoCapitalize="none"
        autoCorrect={false}
        hint={`Private cards can be offered too. Up to ${OFFER_TRADE_ITEMS_MAX} different cards.`}
        testID="offer-cards-search"
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  list: { gap: spacing[2] },
  chosen: { borderWidth: 1, borderRadius: radius.md, padding: spacing[2], gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[2],
  },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  icon: { padding: spacing[1] },
  pressed: { opacity: 0.8 },
});
