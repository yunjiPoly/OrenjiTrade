import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { loadedRows, useImportRows, type ImportRowFilter } from '@/src/api/hooks/inventoryImport';
import type { InventoryImport } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { ImportRowCard } from './ImportRowCard';
import {
  formatCount,
  lateEditText,
  lineNoun,
  matchedSourceText,
  resultLines,
  resultSentence,
  rowTitle,
} from './importLabels';

export interface ImportResultProps {
  preview: InventoryImport;
  /**
   * Cards whose last change reached the API after the import had been added (it was committed
   * elsewhere meanwhile); `null` when there is none.
   */
  lateEdits?: readonly string[] | null;
  onInventory: () => void;
  onAnother: () => void;
}

/**
 * What a commit did: new cards added, cards already owned that got more copies, lines left out
 * (and why), and the way to the inventory. Reading it again, or committing again, shows the same.
 *
 * The lines that were not added stay readable here for as long as the API keeps the import: which
 * ones were not recognised, with what the file said and what can be done about each, and which
 * ones had no printing. A count alone would leave the collector with nothing to act on.
 */
export function ImportResult({ preview, lateEdits, onInventory, onAnother }: ImportResultProps) {
  const { palette } = useTheme();
  const { summary } = preview;
  return (
    <View style={styles.root} testID="import-result">
      <View style={styles.head}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={28}
          color={palette.success}
          accessibilityElementsHidden
        />
        <Text
          accessibilityRole="header"
          style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          Import done
        </Text>
      </View>
      {lateEdits ? (
        <FormMessage testID="import-result-late">{lateEditText(lateEdits)}</FormMessage>
      ) : null}
      <SectionCard>
        {resultLines(preview).map((line) => (
          <View
            key={line.key}
            accessible
            accessibilityLabel={`${formatCount(line.value)} ${line.label}${line.detail ? `: ${line.detail}` : ''}`}
            testID={`import-result-${line.key}`}
            style={styles.line}
          >
            <Text style={[textStyle('xl', 'heading'), styles.value, { color: palette.ink }]}>
              {formatCount(line.value)}
            </Text>
            <View style={styles.grow}>
              <Text style={[textStyle('md'), { color: palette.ink }]}>{line.label}</Text>
              {line.detail ? (
                <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{line.detail}</Text>
              ) : null}
            </View>
          </View>
        ))}
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="import-result-note">
          {resultSentence(preview.result)}
        </Text>
      </SectionCard>
      <Button
        label="Go to my inventory"
        icon="cards-outline"
        onPress={onInventory}
        testID="import-result-inventory"
      />
      <Button
        label="Import another file"
        variant="ghost"
        onPress={onAnother}
        testID="import-result-another"
      />
      {summary.unmatched > 0 ? (
        <LeftOutLines
          preview={preview}
          filter="UNMATCHED"
          title={`Not recognised (${formatCount(summary.unmatched)})`}
          testID="import-result-unmatched"
        />
      ) : null}
      {summary.toChoose > 0 ? (
        <LeftOutLines
          preview={preview}
          filter="CHOOSE_PRINTING"
          title={`Without a printing (${formatCount(summary.toChoose)})`}
          testID="import-result-unchosen"
        />
      ) : null}
    </View>
  );
}

/**
 * The lines of one kind a commit did not add, shown on request and read page by page. They are
 * the rows the API keeps with the import until it is purged; once it is, the list says so.
 */
function LeftOutLines({
  preview,
  filter,
  title,
  testID,
}: {
  preview: InventoryImport;
  filter: Exclude<ImportRowFilter, 'ALL'>;
  title: string;
  testID: string;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const rows = useImportRows(open ? preview.id : null, filter);
  const list = loadedRows(rows.data);
  const noun = lineNoun(preview.source);

  return (
    <SectionCard title={title} testID={testID}>
      {!open ? (
        <Button
          label={`Show these ${noun.many}`}
          variant="secondary"
          onPress={() => setOpen(true)}
          testID={`${testID}-show`}
        />
      ) : !rows.data && rows.error ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID={`${testID}-gone`}>
          These {noun.many} are no longer kept: a finished import is only stored for a while.
        </Text>
      ) : !rows.data ? (
        <SkeletonList rows={2} rowHeight={72} testID={`${testID}-loading`} />
      ) : (
        <View style={styles.list}>
          {list.map((row) =>
            row.status === 'UNMATCHED' ? (
              <ImportRowCard
                key={row.id}
                row={row}
                onChoosePrinting={noop}
                onEdit={noop}
                onToggle={noop}
                disabled
              />
            ) : (
              <View
                key={row.id}
                accessible
                testID={`import-row-${row.position}`}
                style={[
                  styles.unchosen,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                <Text style={[textStyle('md'), styles.name, { color: palette.ink }]}>
                  {rowTitle(row)}
                </Text>
                {matchedSourceText(row) ? (
                  <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                    {matchedSourceText(row)}
                  </Text>
                ) : null}
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  No printing was chosen. To add it, find the card with “Add card” in your
                  inventory.
                </Text>
              </View>
            )
          )}
          {rows.hasNextPage ? (
            <Button
              label="Show more"
              variant="ghost"
              loading={rows.isFetchingNextPage}
              onPress={() => void rows.fetchNextPage()}
              testID={`${testID}-more`}
            />
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}

function noop() {}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  title: { fontWeight: fontWeight.semibold, flex: 1 },
  name: { fontWeight: fontWeight.semibold },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  value: { fontWeight: fontWeight.bold, minWidth: 48, textAlign: 'right' },
  grow: { flex: 1 },
  list: { gap: spacing[2] },
  unchosen: { borderRadius: radius.md, borderWidth: 1, padding: spacing[3], gap: spacing[1] },
});
