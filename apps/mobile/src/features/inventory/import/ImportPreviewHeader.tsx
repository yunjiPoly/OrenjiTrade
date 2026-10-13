import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { ImportRowFilter } from '@/src/api/hooks/inventoryImport';
import type { InventoryImport, UpdateImportRequest } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { Checkbox, SwitchRow } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  clockTime,
  filterOptions,
  formatCount,
  leaveOutLabel,
  plural,
  sectionSwitches,
  summarySentence,
  summaryStats,
} from './importLabels';

export interface ImportPreviewHeaderProps {
  preview: InventoryImport;
  filter: ImportRowFilter;
  onFilter: (filter: ImportRowFilter) => void;
  onSections: (patch: UpdateImportRequest) => void;
  onMostRecent: () => void;
  onCondition: () => void;
  leaveOut: boolean;
  onLeaveOut: (value: boolean) => void;
  /** An edit of the whole preview is being saved. */
  busy: boolean;
}

/**
 * What stands above the lines of an import preview: the four counts (new cards, cards added to
 * ones already owned, lines that need a printing, lines not recognised), until when the preview
 * is kept, the sections of a deck as switches with their counts, what can be done to many lines
 * at once, and the filter.
 */
export function ImportPreviewHeader({
  preview,
  filter,
  onFilter,
  onSections,
  onMostRecent,
  onCondition,
  leaveOut,
  onLeaveOut,
  busy,
}: ImportPreviewHeaderProps) {
  const { palette } = useTheme();
  // Two counts side by side; one per line once the text is large (a label such as "added to
  // cards you own" otherwise stands one word per line in half the width).
  const { fontScale } = useWindowDimensions();
  const oneCountPerLine = fontScale >= 1.4;
  const { summary, sections } = preview;

  return (
    <View style={styles.root} testID="import-preview-header">
      <SectionCard title="What this import adds" testID="import-summary">
        <View style={styles.stats}>
          {summaryStats(summary).map((stat) => (
            <View
              key={stat.key}
              accessible
              accessibilityLabel={`${formatCount(stat.value)} ${stat.label}`}
              testID={`import-summary-${stat.key}`}
              style={[
                styles.stat,
                oneCountPerLine && styles.statWide,
                {
                  borderColor: stat.tone === 'attention' ? palette.warning : palette.border,
                  backgroundColor: palette.surfaceVariant,
                },
              ]}
            >
              <Text style={[textStyle('xl', 'heading'), styles.value, { color: palette.ink }]}>
                {formatCount(stat.value)}
              </Text>
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[textStyle('sm'), { color: palette.ink }]} testID="import-summary-sentence">
          {summarySentence(preview)}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} testID="import-kept-until">
          Nothing is added until you confirm at the bottom. This preview is kept until{' '}
          {clockTime(preview.expiresAt)}.
        </Text>
      </SectionCard>

      {sections ? (
        <SectionCard
          title="Deck sections"
          description="Switch off a section to leave its cards out."
          testID="import-sections"
        >
          {sectionSwitches(sections).map((section) => (
            <SwitchRow
              key={section.key}
              label={section.label}
              help={section.help}
              value={section.value}
              onChange={(value) => onSections({ [section.key]: value })}
              disabled={busy}
              testID={`import-section-${section.key}`}
            />
          ))}
        </SectionCard>
      ) : null}

      {summary.toChoose > 0 ? (
        <SectionCard
          title={
            summary.toChoose === 1
              ? '1 card needs a printing'
              : `${formatCount(summary.toChoose)} cards need a printing`
          }
          description="A card exists in several printings: choose the one you own on each line, or let us take the most recent printing by release date."
          testID="import-unchosen"
        >
          <Button
            label="Use the most recent printing for all unchosen rows"
            icon="calendar-star"
            variant="secondary"
            disabled={busy}
            onPress={onMostRecent}
            testID="import-bulk-recent"
          />
          <Checkbox
            label={leaveOutLabel(summary.toChoose)}
            checked={leaveOut}
            onChange={onLeaveOut}
            disabled={busy}
            testID="import-leave-out"
          />
        </SectionCard>
      ) : null}

      {summary.defaultConditions > 0 ? (
        <SectionCard
          title="Check the conditions"
          description={`Your file does not say the condition of ${plural(summary.defaultConditions, 'card')}. A card without one starts at the lowest grade, so nothing promises more than the card is. Check the condition on each line, or set one for all of them.`}
          testID="import-default-conditions"
        >
          <Button
            label={
              summary.defaultConditions === 1
                ? 'Set the condition of this card'
                : `Set one condition for these ${formatCount(summary.defaultConditions)} cards`
            }
            icon="shield-check-outline"
            variant="secondary"
            disabled={busy}
            onPress={onCondition}
            testID="import-bulk-condition"
          />
        </SectionCard>
      ) : null}

      <ChoiceChips
        label="Lines shown"
        options={filterOptions(summary)}
        value={filter}
        onChange={onFilter}
        testID="import-filter"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3], marginBottom: spacing[3] },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  statWide: { flexBasis: '100%' },
  value: { fontWeight: fontWeight.bold },
});
