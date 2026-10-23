import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadedRows, useImportRows, type ImportRowFilter } from '@/src/api/hooks/inventoryImport';
import type { InventoryImport } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { StatusActions, StatusBody, StatusText } from '@/src/features/account/StatusPage';
import { GroupTitle, SettingsGroup } from '@/src/features/settings/SettingsList';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { IMPORT_COPY } from './importCopy';

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
  const added = (preview.result?.itemsCreated ?? 0) + (preview.result?.itemsMerged ?? 0);
  return (
    <View style={styles.root} testID="import-result">
      <StatusBody
        icon="check"
        tone="accent"
        title={IMPORT_COPY.added(formatCount(added))}
        paddingTop={28}
      >
        <StatusText>{IMPORT_COPY.startPrivate}</StatusText>
      </StatusBody>
      {lateEdits ? (
        <FormMessage testID="import-result-late">{lateEditText(lateEdits)}</FormMessage>
      ) : null}
      <SettingsGroup testID="import-result-lines">
        {resultLines(preview).map((line) => (
          <View
            key={line.key}
            accessible
            accessibilityLabel={`${formatCount(line.value)} ${line.label}${line.detail ? `: ${line.detail}` : ''}`}
            testID={`import-result-${line.key}`}
            style={styles.line}
          >
            <Text style={[styles.value, { color: palette.ink }]}>{formatCount(line.value)}</Text>
            <View style={styles.grow}>
              <Text style={[styles.label, { color: palette.ink }]}>{line.label}</Text>
              {line.detail ? (
                <Text style={[styles.detail, { color: palette.textMuted }]}>{line.detail}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </SettingsGroup>
      <Text style={[styles.detail, { color: palette.textMuted }]} testID="import-result-note">
        {resultSentence(preview.result)}
      </Text>
      {summary.unmatched > 0 ? (
        <LeftOutLines
          preview={preview}
          filter="UNMATCHED"
          title={IMPORT_COPY.notRecognised(formatCount(summary.unmatched))}
          testID="import-result-unmatched"
        />
      ) : null}
      {summary.toChoose > 0 ? (
        <LeftOutLines
          preview={preview}
          filter="CHOOSE_PRINTING"
          title={IMPORT_COPY.withoutPrinting(formatCount(summary.toChoose))}
          testID="import-result-unchosen"
        />
      ) : null}
      <StatusActions>
        <PillButton
          label={IMPORT_COPY.toInventory}
          onPress={onInventory}
          testID="import-result-inventory"
        />
        <PillButton
          label={IMPORT_COPY.another}
          variant="outline"
          onPress={onAnother}
          testID="import-result-another"
        />
      </StatusActions>
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
  // Shown at once (mockup v50 screen 68): what was not added, and what to do about it.
  const [open, setOpen] = useState(true);
  const rows = useImportRows(open ? preview.id : null, filter);
  const list = loadedRows(rows.data);
  const noun = lineNoun(preview.source);

  return (
    <View style={styles.leftOut} testID={testID}>
      <GroupTitle>{title}</GroupTitle>
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
                readOnly
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
                  No printing was chosen. To add it, find the card with “Add cards” in your
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
    </View>
  );
}

function noop() {}

const styles = StyleSheet.create({
  root: { flexGrow: 1, gap: 18 },
  name: { fontWeight: fontWeight.semibold },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  value: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
    minWidth: 40,
    textAlign: 'right',
  },
  label: { fontSize: 15, lineHeight: 20 },
  detail: { fontSize: 12, lineHeight: 17 },
  grow: { flex: 1 },
  leftOut: { gap: 6 },
  list: { gap: spacing[2] },
  unchosen: { borderRadius: radius.md, borderWidth: 1, padding: spacing[3], gap: spacing[1] },
});
