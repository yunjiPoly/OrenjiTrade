import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useConfirmAllStale, useInventorySummary } from '@/src/api/hooks/inventory';
import { Button } from '@/src/components/ui/Button';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { cardCount, endsLabel } from '@/src/lib/inventory';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Totals of the collector's inventory (web: `app-inventory-summary`, `GET /inventory/summary`):
 * cards and copies, how many are public right now, the next temporary publication end, and the
 * stale or hidden listings that need a confirmation, with "Confirm all".
 */
export function InventorySummaryStrip() {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const summary = useInventorySummary();
  const confirmAll = useConfirmAllStale();
  const data = summary.data;
  if (!data || data.totalItems === 0) {
    return null;
  }
  const needs = data.staleCount + data.hiddenCount;
  const ends = endsLabel(data.nextExpiry);

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
    <View style={styles.root} testID="inventory-summary">
      <Text
        style={[textStyle('sm'), { color: palette.textMuted }]}
        testID="inventory-summary-totals"
      >
        <Text style={[styles.bold, { color: palette.ink }]}>{cardCount(data.totalItems)}</Text>
        {` · ${data.totalQuantity} ${data.totalQuantity === 1 ? 'copy' : 'copies'} · ${data.effectivePublicCount} public now`}
        {ends ? ` · next publication ${ends}` : ''}
      </Text>
      {needs > 0 ? (
        <View
          testID="inventory-needs-confirmation"
          style={[
            styles.needs,
            { borderColor: palette.status.stale, backgroundColor: palette.surfaceVariant },
          ]}
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  bold: { fontWeight: fontWeight.semibold },
  needs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  grow: { flex: 1, minWidth: 180 },
  button: { minHeight: 40, paddingVertical: spacing[2] },
});
