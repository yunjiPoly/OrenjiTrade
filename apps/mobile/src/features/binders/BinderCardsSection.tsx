import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import type { InventoryItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { fontFamily, fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { EDIT_BINDER_COPY } from './binderCopy';

export interface BinderCardsSectionProps {
  /** "Sell as a deck core" is on: "Key cards · optional". */
  deckCore: boolean;
  /** The cards in the binder (loaded pages). */
  saved: readonly InventoryItemResponse[];
  /** Cards picked from the inventory, moved in with "Save changes". */
  added: readonly InventoryItemResponse[];
  /** Saved cards taken out, unfiled with "Save changes". */
  takenOut: ReadonlySet<string>;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  disabled: boolean;
  onAdd: () => void;
  onTakeOut: (item: InventoryItemResponse) => void;
  onDropAdded: (item: InventoryItemResponse) => void;
}

/**
 * The dashed section of Edit binder (spec 2026-10-14, section 7, screen 18): "Key cards ·
 * optional" when selling, "Cards inside" when not, with "Add cards" (pick from your inventory) and
 * the hint "Helps buyers find it when they search a card." or "No cards in this binder yet.". The
 * cards listed under it can be taken out; nothing moves until "Save changes".
 */
export function BinderCardsSection({
  deckCore,
  saved,
  added,
  takenOut,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onMore,
  disabled,
  onAdd,
  onTakeOut,
  onDropAdded,
}: BinderCardsSectionProps) {
  const { palette } = useTheme();
  const empty = saved.length === 0 && added.length === 0;
  const hint = deckCore
    ? EDIT_BINDER_COPY.keyCardsHint
    : empty && !loading && !error
      ? EDIT_BINDER_COPY.noCardsHint
      : null;
  return (
    <View
      testID="binder-cards-section"
      style={[styles.section, { borderColor: palette.borderStrong }]}
    >
      <View style={styles.head}>
        <Text
          accessibilityRole="header"
          testID="binder-cards-title"
          style={[styles.title, { color: palette.ink }]}
        >
          {deckCore ? EDIT_BINDER_COPY.keyCards : EDIT_BINDER_COPY.cardsInside}
          {deckCore ? (
            <Text style={[styles.optional, { color: palette.textMuted }]}>
              {EDIT_BINDER_COPY.optional}
            </Text>
          ) : null}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={EDIT_BINDER_COPY.addCards}
          disabled={disabled}
          onPress={() => {
            // The field typed in last lets go first: iOS gives the keyboard back to it when the
            // card picker leaves, over "Create binder" (stage R5 review, F2).
            Keyboard.dismiss();
            onAdd();
          }}
          hitSlop={6}
          testID="binder-add-cards"
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="plus" size={16} color={palette.accent} />
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.addLabel, { color: palette.accent }]}
          >
            {EDIT_BINDER_COPY.addCards}
          </Text>
        </Pressable>
      </View>
      {hint ? (
        <Text testID="binder-cards-hint" style={[styles.hint, { color: palette.textMuted }]}>
          {hint}
        </Text>
      ) : null}
      {loading ? <SkeletonList rows={2} rowHeight={52} testID="binder-cards-loading" /> : null}
      {error ? (
        <ErrorState
          compact
          testID="binder-cards-error"
          error={error}
          title={EDIT_BINDER_COPY.cardsLoadError}
          onRetry={onRetry}
        />
      ) : null}
      {saved.map((item) => (
        <CardLine
          key={item.id}
          item={item}
          state={takenOut.has(item.id) ? 'out' : 'in'}
          disabled={disabled}
          onToggle={() => onTakeOut(item)}
        />
      ))}
      {added.map((item) => (
        <CardLine
          key={item.id}
          item={item}
          state="added"
          disabled={disabled}
          onToggle={() => onDropAdded(item)}
        />
      ))}
      {hasMore ? (
        <Button
          label={EDIT_BINDER_COPY.showMore}
          variant="ghost"
          loading={loadingMore}
          onPress={onMore}
          testID="binder-cards-more"
        />
      ) : null}
    </View>
  );
}

function CardLine({
  item,
  state,
  disabled,
  onToggle,
}: {
  item: InventoryItemResponse;
  /** In the binder, taken out (leaves with the save) or picked (joins with the save). */
  state: 'in' | 'out' | 'added';
  disabled: boolean;
  onToggle: () => void;
}) {
  const { palette } = useTheme();
  const out = state === 'out';
  const note =
    state === 'added' ? EDIT_BINDER_COPY.pendingAdd : out ? EDIT_BINDER_COPY.pendingRemove : null;
  return (
    <View testID={`binder-card-${item.id}`} style={[styles.line, out && styles.out]}>
      <CardImage src={printingImageUrl(item.printing)} alt="" game={item.card.game} size="xs" />
      <View style={styles.lineText}>
        <Text
          numberOfLines={2}
          style={[styles.lineName, { color: palette.ink }, out && styles.struck]}
        >
          {item.card.name}
        </Text>
        <Text style={[styles.lineCode, { color: palette.textMuted }]}>
          {EDIT_BINDER_COPY.cardLine(printingCode(item.printing), item.quantity)}
        </Text>
        {note ? (
          <Text
            testID={`binder-card-note-${item.id}`}
            style={[
              styles.lineNote,
              { color: state === 'added' ? palette.accent : palette.warning },
            ]}
          >
            {note}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          out
            ? EDIT_BINDER_COPY.undoRemove(item.card.name)
            : EDIT_BINDER_COPY.removeCard(item.card.name)
        }
        disabled={disabled}
        onPress={onToggle}
        hitSlop={6}
        testID={`binder-card-toggle-${item.id}`}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons
          name={out ? 'undo-variant' : 'close'}
          size={20}
          color={palette.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: fontWeight.semibold },
  optional: { fontWeight: fontWeight.regular },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  addLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  hint: { fontSize: 12, lineHeight: 17 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  out: { opacity: 0.6 },
  lineText: { flex: 1, minWidth: 0, gap: 1 },
  lineName: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  struck: { textDecorationLine: 'line-through' },
  lineCode: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.mono },
  lineNote: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
