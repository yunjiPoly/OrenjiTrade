import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useReorderBinders } from '@/src/api/hooks/binders';
import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/** The list with the binder at `from` moved to `to` (the web's `moveItemInArray`). */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

/**
 * Reorder the collector's binders (the web's binder manager: the move buttons; drag and drop has
 * no keyboard on a phone): up / down arrows per binder, saved with `PUT /binders/reorder` when
 * "Save order" is pressed. The order is the one collectors see.
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
  const [order, setOrder] = useState<BinderResponse[]>([...binders]);
  useEffect(() => {
    if (visible) {
      setOrder([...binders]);
    }
  }, [binders, visible]);
  const changed = order.some((binder, index) => binder.id !== binders[index]?.id);

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
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        Move binders up or down. The order is the one collectors see.
      </Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        {order.map((binder, index) => (
          <View
            key={binder.id}
            testID={`reorder-${binder.id}`}
            accessibilityLabel={`${binder.name}, position ${index + 1} of ${order.length}`}
            style={[styles.row, { borderColor: palette.border, backgroundColor: palette.surface }]}
          >
            <Text style={[textStyle('sm'), styles.position, { color: palette.textMuted }]}>
              {index + 1}
            </Text>
            <Text style={[textStyle('md'), styles.name, { color: palette.ink }]} numberOfLines={1}>
              {binder.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${binder.name} up`}
              disabled={index === 0 || reorder.isPending}
              onPress={() => setOrder((current) => moved(current, index, index - 1))}
              hitSlop={6}
              testID={`reorder-${binder.id}-up`}
              style={[styles.arrow, index === 0 && styles.disabled]}
            >
              <MaterialCommunityIcons name="arrow-up" size={22} color={palette.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${binder.name} down`}
              disabled={index === order.length - 1 || reorder.isPending}
              onPress={() => setOrder((current) => moved(current, index, index + 1))}
              hitSlop={6}
              testID={`reorder-${binder.id}-down`}
              style={[styles.arrow, index === order.length - 1 && styles.disabled]}
            >
              <MaterialCommunityIcons name="arrow-down" size={22} color={palette.ink} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onClose} disabled={reorder.isPending} />
        <Button
          label="Save order"
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
  list: { flexGrow: 0 },
  content: { gap: spacing[2] },
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
});
