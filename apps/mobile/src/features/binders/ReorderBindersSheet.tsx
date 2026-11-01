import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useReorderBinders } from '@/src/api/hooks/binders';
import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import {
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { orderBinders } from './binderForm';

/** The list with the binder at `from` moved to `to` (the web's `moveItemInArray`). */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

/** The binders as Inventory › Binders lists them: the deck cores first, then the others. */
function listed(binders: readonly BinderResponse[]): BinderResponse[] {
  const { cores, binders: plain } = orderBinders(binders);
  return [...cores, ...plain];
}

/**
 * Reorder the collector's binders (the web's binder manager: the move buttons; drag and drop has
 * no keyboard on a phone): up / down arrows per binder, saved with `PUT /binders/reorder` when
 * "Save order" is pressed. The order is the one collectors see. As in Inventory › Binders, the deck
 * cores come first ("Deck cores", then "Binders" when there are both), and a binder moves inside
 * its group. The description scrolls with the binders and the two buttons wrap onto two lines, so
 * the binders, Cancel and "Save order" stay within reach at the largest text size (review fix 2 of
 * stage R3: the description filled the sheet and Cancel was pushed off the screen).
 */
export function ReorderBindersSheet({
  visible,
  binders,
  onClose,
}: {
  visible: boolean;
  binders: readonly BinderResponse[];
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const reorder = useReorderBinders();
  const [order, setOrder] = useState<BinderResponse[]>(() => listed(binders));
  // Opening the sheet starts from the saved order again (render-time reset, no effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setOrder(listed(binders));
    }
  }
  const initial = listed(binders);
  const changed = order.some((binder, index) => binder.id !== initial[index]?.id);
  const isCore = (binder: BinderResponse | undefined) => binder?.sellsAsCore ?? false;
  const coreCount = order.filter(isCore).length;
  const grouped = coreCount > 0 && coreCount < order.length;

  const save = async () => {
    try {
      await reorder.mutateAsync(order.map((binder) => binder.id));
      snackbar.show('Binder order saved.');
      onClose();
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Reorder binders"
      testID="reorder-binders"
    >
      <ScrollView style={styles.list} contentContainerStyle={styles.content} testID="reorder-list">
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Move binders up or down. The order is the one collectors see.
        </Text>
        {order.map((binder, index) => {
          const core = isCore(binder);
          // Its place inside its group (deck cores, then the other binders).
          const position = core ? index + 1 : index - coreCount + 1;
          const groupSize = core ? coreCount : order.length - coreCount;
          const first = index === 0 || isCore(order[index - 1]) !== core;
          const last = index === order.length - 1 || isCore(order[index + 1]) !== core;
          return (
            <View key={binder.id} style={styles.entry}>
              {grouped && first ? (
                <Text
                  accessibilityRole="header"
                  testID={core ? 'reorder-group-cores' : 'reorder-group-binders'}
                  style={[textStyle('sm'), styles.group, { color: palette.textMuted }]}
                >
                  {core ? 'Deck cores' : 'Binders'}
                </Text>
              ) : null}
              <View
                testID={`reorder-${binder.id}`}
                accessibilityLabel={`${binder.name}, position ${position} of ${groupSize}`}
                style={[
                  styles.row,
                  { borderColor: palette.border, backgroundColor: palette.surface },
                ]}
              >
                <Text style={[textStyle('sm'), styles.position, { color: palette.textMuted }]}>
                  {position}
                </Text>
                <Text
                  style={[textStyle('md'), styles.name, { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {binder.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${binder.name} up`}
                  disabled={first || reorder.isPending}
                  onPress={() => setOrder((current) => moved(current, index, index - 1))}
                  hitSlop={6}
                  testID={`reorder-${binder.id}-up`}
                  style={[styles.arrow, first && styles.disabled]}
                >
                  <MaterialCommunityIcons name="arrow-up" size={22} color={palette.ink} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${binder.name} down`}
                  disabled={last || reorder.isPending}
                  onPress={() => setOrder((current) => moved(current, index, index + 1))}
                  hitSlop={6}
                  testID={`reorder-${binder.id}-down`}
                  style={[styles.arrow, last && styles.disabled]}
                >
                  <MaterialCommunityIcons name="arrow-down" size={22} color={palette.ink} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.actions} testID="reorder-actions">
        <Button
          label="Cancel"
          variant="ghost"
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          onPress={onClose}
          disabled={reorder.isPending}
          testID="reorder-cancel"
        />
        <Button
          label="Save order"
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          loading={reorder.isPending}
          loadingLabel="Saving…"
          disabled={!changed}
          onPress={() => void save()}
          testID="reorder-save"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0, flexShrink: 1 },
  content: { gap: spacing[2] },
  entry: { gap: spacing[2] },
  group: { fontWeight: fontWeight.semibold, marginTop: spacing[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  position: { width: 20, textAlign: 'center' },
  name: { flex: 1, fontWeight: fontWeight.semibold },
  arrow: { padding: spacing[1] },
  disabled: { opacity: 0.3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing[2] },
});
