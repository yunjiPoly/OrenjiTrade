import { StyleSheet, View } from 'react-native';

import type { ImportRowFilter } from '@/src/api/hooks/inventoryImport';
import type { InventoryImport, UpdateImportRequest } from '@/src/api/types';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { SettingsGroup, SettingsSwitch } from '@/src/features/settings/SettingsList';
import { fontWeight, useTheme } from '@/src/theme';

import { IMPORT_COPY } from './importCopy';
import {
  assumedCopies,
  assumedCopiesText,
  clockTime,
  defaultConditionsText,
  sectionSwitches,
  summarySentence,
} from './importLabels';

export interface ImportPreviewHeaderProps {
  preview: InventoryImport;
  /** Shows the lines of one kind ("Show these cards" of the assumed copies). */
  onFilter: (filter: ImportRowFilter) => void;
  onSections: (patch: UpdateImportRequest) => void;
  onCondition: () => void;
  /** An edit of the whole preview is being saved. */
  busy: boolean;
  /** The lowest condition of each game: where a line whose file names none starts. */
  lowestGrades: readonly string[];
  /** What the inventory limit has no room for, when the import does not fit; `null` otherwise. */
  limitRoom: string | null;
}

/**
 * The choices of "Check the cards" that are not on a line (stage R14: the file, the filter, the
 * amber bar and "leave out" for the lines that still need a printing stay on screen above the
 * list, the lines come right under them, and these follow the lines): whether the import fits the
 * inventory limit (the screen says it above the lines), the copies taken as the plain one, the
 * conditions the file did not say, the deck's sections as switches with their copies, and what
 * the import adds in one sentence with until when the preview is kept. Each shows only when it
 * has something to say.
 */
export function ImportPreviewHeader({
  preview,
  onFilter,
  onSections,
  onCondition,
  busy,
  lowestGrades,
  limitRoom,
}: ImportPreviewHeaderProps) {
  const { palette } = useTheme();
  const { summary, sections } = preview;
  const conditions = defaultConditionsText(summary, lowestGrades);
  const assumed = assumedCopies(summary);
  const assumedText = assumedCopiesText(assumed, preview.source);

  return (
    <View style={styles.root} testID="import-preview-header">
      {limitRoom ? (
        <FormMessage tone="info" testID="import-limit-room">
          {limitRoom}
        </FormMessage>
      ) : null}

      {assumed > 0 ? (
        <Notice
          title={assumedText.title}
          description={assumedText.description}
          action={assumedText.action}
          onAction={() => onFilter('MOST_RECENT_ASSUMED')}
          actionTestID="import-show-assumed"
          testID="import-assumed"
        />
      ) : null}

      {summary.defaultConditions > 0 ? (
        <Notice
          title="Check the conditions"
          description={conditions.description}
          action={conditions.action}
          onAction={onCondition}
          disabled={busy}
          actionTestID="import-bulk-condition"
          testID="import-default-conditions"
        />
      ) : null}

      {sections ? (
        <SettingsGroup
          title={IMPORT_COPY.sections}
          footnote={IMPORT_COPY.sectionsHint}
          testID="import-sections"
        >
          {sectionSwitches(sections).map((section) => (
            <SettingsSwitch
              key={section.key}
              label={section.label}
              help={section.help}
              value={section.value}
              onChange={(value) => onSections({ [section.key]: value })}
              disabled={busy}
              testID={`import-section-${section.key}`}
            />
          ))}
        </SettingsGroup>
      ) : null}

      <View style={styles.sentences}>
        <Text style={[styles.sentence, { color: palette.ink }]} testID="import-summary-sentence">
          {summarySentence(preview)}
        </Text>
        <Text style={[styles.small, { color: palette.textMuted }]} testID="import-kept-until">
          Nothing is added until you confirm at the bottom. This preview is kept until{' '}
          {clockTime(preview.expiresAt)}.
        </Text>
      </View>
    </View>
  );
}

/** A quiet card that asks something of the collector, with its one button. */
function Notice({
  title,
  description,
  action,
  onAction,
  disabled = false,
  actionTestID,
  testID,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
  actionTestID: string;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.notice, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Text accessibilityRole="header" style={[styles.noticeTitle, { color: palette.ink }]}>
        {title}
      </Text>
      <Text style={[styles.small, { color: palette.textMuted }]}>{description}</Text>
      <PillButton
        label={action}
        variant="outline"
        disabled={disabled}
        onPress={onAction}
        testID={actionTestID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, paddingTop: 16, paddingBottom: 6 },
  notice: { gap: 6, padding: 14, borderRadius: 16, borderWidth: 1 },
  noticeTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  sentences: { gap: 4 },
  sentence: { fontSize: 13, lineHeight: 18 },
  small: { fontSize: 12, lineHeight: 17 },
});
