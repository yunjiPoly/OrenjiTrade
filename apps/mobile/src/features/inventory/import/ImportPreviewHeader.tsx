import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { ImportRowFilter } from '@/src/api/hooks/inventoryImport';
import type { InventoryImport, UpdateImportRequest } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { Checkbox, FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  assumedCopies,
  assumedCopiesText,
  clockTime,
  defaultConditionsText,
  formatCount,
  leaveOutLabel,
  needPrintingTitle,
  sectionSwitches,
  summarySentence,
  summaryStats,
  type SummaryStat,
} from './importLabels';

export interface ImportPreviewHeaderProps {
  preview: InventoryImport;
  /** Shows the lines of one kind (a count that is pressed). */
  onFilter: (filter: ImportRowFilter) => void;
  onSections: (patch: UpdateImportRequest) => void;
  onMostRecent: () => void;
  onCondition: () => void;
  leaveOut: boolean;
  onLeaveOut: (value: boolean) => void;
  /** An edit of the whole preview is being saved. */
  busy: boolean;
  /** The lowest condition of each game: where a line whose file names none starts. */
  lowestGrades: readonly string[];
  /** What the plan has no room for, when the import does not fit; `null` otherwise. */
  planRoom: string | null;
}

/** The lines a count stands for: pressing it shows them. */
const STAT_FILTER: Partial<Record<SummaryStat['key'], ImportRowFilter>> = {
  choose: 'CHOOSE_PRINTING',
  unmatched: 'UNMATCHED',
};

/**
 * What stands above the lines of an import preview: the four counts (new cards, cards added to
 * ones already owned, lines that need a printing, lines not recognised), until when the preview
 * is kept, the sections of a deck as switches with their counts, and what can be done to many
 * lines at once. The filter itself stays on screen above the list (`ImportPreview`); the two
 * counts that ask something of the collector are buttons that set it, and so is the card that
 * counts the lines whose copy was assumed, for as long as there are any.
 */
export function ImportPreviewHeader({
  preview,
  onFilter,
  onSections,
  onMostRecent,
  onCondition,
  leaveOut,
  onLeaveOut,
  busy,
  lowestGrades,
  planRoom,
}: ImportPreviewHeaderProps) {
  const { palette } = useTheme();
  // Two counts side by side; one per line once the text is large (a label such as "added to
  // cards you own" otherwise stands one word per line in half the width).
  const { fontScale } = useWindowDimensions();
  const oneCountPerLine = fontScale >= 1.4;
  const { summary, sections } = preview;
  const conditions = defaultConditionsText(summary, lowestGrades);
  const assumed = assumedCopies(summary);
  const assumedText = assumedCopiesText(assumed, preview.source);

  return (
    <View style={styles.root} testID="import-preview-header">
      <SectionCard title="What this import adds" testID="import-summary">
        <View style={styles.stats}>
          {summaryStats(summary).map((stat) => {
            const shows = stat.value > 0 ? STAT_FILTER[stat.key] : undefined;
            const body = (
              <>
                <Text style={[textStyle('xl', 'heading'), styles.value, { color: palette.ink }]}>
                  {formatCount(stat.value)}
                </Text>
                <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{stat.label}</Text>
              </>
            );
            const box = [
              styles.stat,
              oneCountPerLine && styles.statWide,
              {
                borderColor: stat.tone === 'attention' ? palette.warning : palette.border,
                backgroundColor: palette.surfaceVariant,
              },
            ];
            return shows ? (
              <Pressable
                key={stat.key}
                accessibilityRole="button"
                accessibilityLabel={`${formatCount(stat.value)} ${stat.label}`}
                accessibilityHint="Shows them"
                onPress={() => onFilter(shows)}
                testID={`import-summary-${stat.key}`}
                style={({ pressed }) => [...box, pressed && styles.pressed]}
              >
                {body}
              </Pressable>
            ) : (
              <View
                key={stat.key}
                accessible
                accessibilityLabel={`${formatCount(stat.value)} ${stat.label}`}
                testID={`import-summary-${stat.key}`}
                style={box}
              >
                {body}
              </View>
            );
          })}
        </View>
        <Text style={[textStyle('sm'), { color: palette.ink }]} testID="import-summary-sentence">
          {summarySentence(preview)}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} testID="import-kept-until">
          Nothing is added until you confirm at the bottom. This preview is kept until{' '}
          {clockTime(preview.expiresAt)}.
        </Text>
      </SectionCard>

      {planRoom ? (
        <FormMessage tone="info" testID="import-plan-room">
          {planRoom}
        </FormMessage>
      ) : null}

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
          title={needPrintingTitle(summary.toChoose, preview.source)}
          description="A card exists in several printings: choose the one you own on each line, or let us take the most recent printing by release date. Where that set has several versions of a card, the plain copy (Unlimited, no foil) is taken and marked for you to check."
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
            label={leaveOutLabel(summary.toChoose, preview.source)}
            checked={leaveOut}
            onChange={onLeaveOut}
            disabled={busy}
            testID="import-leave-out"
          />
        </SectionCard>
      ) : null}

      {assumed > 0 ? (
        <SectionCard
          title={assumedText.title}
          description={assumedText.description}
          testID="import-assumed"
        >
          <Button
            label={assumedText.action}
            icon="filter-variant"
            variant="secondary"
            onPress={() => onFilter('MOST_RECENT_ASSUMED')}
            testID="import-show-assumed"
          />
        </SectionCard>
      ) : null}

      {summary.defaultConditions > 0 ? (
        <SectionCard
          title="Check the conditions"
          description={conditions.description}
          testID="import-default-conditions"
        >
          <Button
            label={conditions.action}
            icon="shield-check-outline"
            variant="secondary"
            disabled={busy}
            onPress={onCondition}
            testID="import-bulk-condition"
          />
        </SectionCard>
      ) : null}
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
  pressed: { opacity: 0.8 },
});
