import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useCard } from '@/src/api/hooks/catalog';
import type { ImportRow, PrintingSummary } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { PrintingList } from '@/src/features/catalog/PrintingList';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { deckText, matchedSourceText, orderedPrintings, plural, rowTitle } from './importLabels';

export interface ImportPrintingSheetProps {
  /** The row whose copy is chosen; `null` closes the sheet. */
  row: ImportRow | null;
  /** A choice is being saved. */
  busy?: boolean;
  /** A printing was picked (`null`: back to "Choose printing"). */
  onChoose: (row: ImportRow, printingId: string | null) => void;
  onClose: () => void;
}

/**
 * "Which copy" of an import row: the printings of its card as the card page and "Add a card" list
 * them (picture, printing code, set, rarity, edition, language, finish). The printings that fit
 * what a CSV row says come first, under "Fits your file"; any printing of the card may be chosen.
 * A pick is saved at once and closes the sheet.
 */
export function ImportPrintingSheet({
  row,
  busy = false,
  onChoose,
  onClose,
}: ImportPrintingSheetProps) {
  // The row stays on the sheet while it slides away.
  const [shown, setShown] = useState<ImportRow | null>(row);
  if (row && row !== shown) {
    setShown(row);
  }
  return (
    <BottomSheet
      visible={row !== null}
      onClose={onClose}
      title="Which copy"
      testID="import-printing-sheet"
    >
      {shown ? <Printings row={shown} busy={busy} onChoose={onChoose} /> : null}
    </BottomSheet>
  );
}

function Printings({
  row,
  busy,
  onChoose,
}: {
  row: ImportRow;
  busy: boolean;
  onChoose: (row: ImportRow, printingId: string | null) => void;
}) {
  const { palette } = useTheme();
  const card = useCard(row.card?.id);
  const name = rowTitle(row);
  const printings = card.data?.printings ?? [];
  const { suggested, others } = orderedPrintings(printings, row.suggestedPrintingIds);
  const pick = (printing: PrintingSummary) => {
    if (printing.id && !busy) {
      onChoose(row, printing.id);
    }
  };
  const selectedId = row.printing?.id ?? null;

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.content} aria-busy={busy}>
        <Text
          accessibilityRole="header"
          style={[textStyle('md'), styles.name, { color: palette.ink }]}
          testID="import-printing-card"
        >
          {name}
        </Text>
        {/* What the file said and where (stage R14: the line of "Check the cards" is short; the
            match is checked here). */}
        {[matchedSourceText(row), deckText(row.deck)].filter(Boolean).length > 0 ? (
          <Text
            style={[textStyle('xs'), { color: palette.textMuted }]}
            testID="import-printing-source"
          >
            {[matchedSourceText(row), deckText(row.deck)].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {card.data ? (
          <>
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
              {plural(printings.length, 'printing')}. Pick the one you own.
            </Text>
            {suggested.length > 0 ? (
              <>
                <Text
                  accessibilityRole="header"
                  style={[textStyle('sm'), styles.name, { color: palette.ink }]}
                >
                  Fits your file
                </Text>
                <PrintingList
                  printings={suggested}
                  cardName={name}
                  game={row.card?.game}
                  selectedId={selectedId}
                  onSelect={pick}
                  label="Printings that fit your file"
                  testID="import-printings-suggested"
                />
                {others.length > 0 ? (
                  <Text
                    accessibilityRole="header"
                    style={[textStyle('sm'), styles.name, { color: palette.ink }]}
                  >
                    Other printings
                  </Text>
                ) : null}
              </>
            ) : null}
            {others.length > 0 ? (
              <PrintingList
                printings={others}
                cardName={name}
                game={row.card?.game}
                selectedId={selectedId}
                onSelect={pick}
                label={suggested.length > 0 ? 'Other printings' : 'Printing'}
                testID="import-printings"
              />
            ) : null}
            {row.printing ? (
              <Button
                label="Decide later"
                variant="ghost"
                icon="undo-variant"
                disabled={busy}
                onPress={() => onChoose(row, null)}
                accessibilityHint="Puts this card back to “Choose printing”"
                style={styles.clear}
                testID="import-printing-clear"
              />
            ) : null}
          </>
        ) : card.error ? (
          <ErrorState
            compact
            error={card.error}
            title="The printings could not load"
            onRetry={() => void card.refetch()}
            testID="import-printing-error"
          />
        ) : (
          <SkeletonList rows={3} rowHeight={72} testID="import-printing-loading" />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { gap: spacing[3], paddingBottom: spacing[2] },
  name: { fontWeight: fontWeight.semibold },
  clear: { alignSelf: 'flex-start' },
});
