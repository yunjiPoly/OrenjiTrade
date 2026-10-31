import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useConfirmAllStale, useInventorySummary } from '@/src/api/hooks/inventory';
import { Button } from '@/src/components/ui/Button';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * The freshness rules on the Inventory (kept by the 2026-10-14 redesign, where they add the least
 * clutter): only while stale or hidden cards wait for a confirmation that they are still
 * available, a notice with "Confirm all" (`POST /inventory/items/bulk`, CONFIRM). Saving a card
 * from Edit card confirms it too.
 */
export function NeedsConfirmationNotice() {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const summary = useInventorySummary();
  const confirmAll = useConfirmAllStale();
  const data = summary.data;
  const needs = data ? data.staleCount + data.hiddenCount : 0;
  if (!data || needs === 0) {
    return null;
  }

  const run = async () => {
    try {
      const result = await confirmAll.mutateAsync();
      snackbar.show(
        result.updated === 1
          ? '1 card confirmed as still available.'
          : `${result.updated} cards confirmed as still available.`
      );
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  return (
    <View
      testID="inventory-needs-confirmation"
      style={[styles.root, { borderColor: palette.status.stale, backgroundColor: palette.surface }]}
    >
      <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
        {needs === 1
          ? '1 card needs a confirmation that it is still available.'
          : `${needs} cards need a confirmation that they are still available.`}
        {data.hiddenCount > 0 ? ` ${data.hiddenCount} hidden until confirmed.` : ''}
      </Text>
      <Button
        label="Confirm all"
        loadingLabel="Confirming…"
        variant="secondary"
        loading={confirmAll.isPending}
        onPress={() => void run()}
        style={styles.button}
        testID="inventory-confirm-all"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  grow: { flex: 1, minWidth: 180 },
  button: { minHeight: 44, paddingVertical: spacing[2] },
});
