import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { ImportRow } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  CHOOSE_PRINTING,
  assumedCopyText,
  deckText,
  matchedSourceText,
  ownedText,
  plural,
  rowConditionText,
  rowCopyLabel,
  rowSourceText,
  rowStateText,
  rowSummary,
  rowTitle,
  unmatchedNextStep,
  unmatchedReasonText,
} from './importLabels';

/**
 * From this text size on a line is laid out in two storeys: the tick box and the picture on top,
 * the name and the controls under them across the whole width. Next to the picture a text is half
 * the screen wide, and at the accessibility sizes "Clockwork" and "Damaged" broke in the middle of
 * the word.
 */
export const STACKED_ROW_FONT_SCALE = 1.4;

export interface ImportRowCardProps {
  row: ImportRow;
  /** Opens the "Which copy" chooser of the row. */
  onChoosePrinting: (row: ImportRow) => void;
  /** Opens the condition and copies of the row. */
  onEdit: (row: ImportRow) => void;
  /** Leaves the row out, or puts it back. */
  onToggle: (row: ImportRow) => void;
  disabled?: boolean;
}

/**
 * One line of an import preview.
 *
 * A recognised line: the card with its picture (the API's own picture), the copy chosen or
 * "Choose printing", its condition, its copies, and whether it goes in. Three controls, each named
 * with the card for a screen reader: in or out, which copy, condition and copies. Under them, in
 * small print, what the file said (a passcode, or the set, number and rarity as written), so the
 * match can be checked and two lines of one card can be told apart.
 *
 * A line nothing fits: what the file said, as written (for a deck, with its sections), why it was
 * not recognised and what the collector can do about it. It is never imported and has no control.
 */
export const ImportRowCard = memo(function ImportRowCard({
  row,
  onChoosePrinting,
  onEdit,
  onToggle,
  disabled = false,
}: ImportRowCardProps) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACKED_ROW_FONT_SCALE;
  const title = rowTitle(row);

  if (row.status === 'UNMATCHED') {
    const said = rowSourceText(row);
    const sections = deckText(row.deck);
    return (
      <View
        accessible
        accessibilityLabel={rowSummary(row)}
        testID={`import-row-${row.position}`}
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <View style={styles.main}>
          <View style={[styles.unknown, { backgroundColor: palette.surfaceVariant }]}>
            <MaterialCommunityIcons name="help" size={20} color={palette.textMuted} />
          </View>
          <View style={styles.text}>
            <Text style={[textStyle('xs'), styles.strong, { color: palette.danger }]}>
              Not recognised
            </Text>
            <Text style={[textStyle('md'), styles.name, { color: palette.ink }]}>{title}</Text>
            {said ? (
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{said}</Text>
            ) : null}
            {sections ? (
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{sections}</Text>
            ) : null}
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {unmatchedReasonText(row.unmatchedReason)}
            </Text>
            <Text
              style={[textStyle('xs'), { color: palette.ink }]}
              testID={`import-row-${row.position}-next`}
            >
              {unmatchedNextStep(row.unmatchedReason)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const needsPrinting = row.status === 'CHOOSE_PRINTING';
  const state = rowStateText(row);
  const deck = deckText(row.deck);
  const owned = ownedText(row);
  const copy = rowCopyLabel(row);
  const condition = rowConditionText(row);
  const fromFile = matchedSourceText(row);
  // A copy that left the catalog leaves the line to choose again: nothing is assumed any more.
  const assumed = needsPrinting ? null : assumedCopyText(row);
  const dimmed = !row.included || !row.inScope;

  const heading = (
    <>
      <Text
        style={[textStyle('md'), styles.name, { color: dimmed ? palette.textMuted : palette.ink }]}
        testID={`import-row-${row.position}-name`}
      >
        {title}
      </Text>
      {state ? (
        <Text
          style={[textStyle('xs'), styles.strong, { color: palette.textMuted }]}
          testID={`import-row-${row.position}-state`}
        >
          {state}
        </Text>
      ) : null}
    </>
  );

  const controls = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Which copy of ${title}: ${copy}${assumed ? ' (taken as the plain copy: check it)' : ''}`}
        accessibilityHint="Opens the printings of this card"
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => onChoosePrinting(row)}
        testID={`import-row-${row.position}-printing`}
        style={({ pressed }) => [
          styles.control,
          {
            borderColor: needsPrinting ? palette.warning : palette.borderStrong,
            backgroundColor: needsPrinting ? palette.surfaceVariant : palette.surface,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text
          style={[
            textStyle('sm'),
            styles.controlText,
            needsPrinting && styles.strong,
            { color: palette.ink },
          ]}
        >
          {needsPrinting ? CHOOSE_PRINTING : copy}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={palette.textMuted} />
      </Pressable>
      {assumed ? (
        <Text
          style={[textStyle('xs'), { color: palette.ink }]}
          testID={`import-row-${row.position}-assumed`}
        >
          {assumed}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Condition and copies of ${title}: ${condition}, ${plural(row.quantity, 'copy', 'copies')}`}
        accessibilityHint="Opens the condition and the number of copies"
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => onEdit(row)}
        testID={`import-row-${row.position}-edit`}
        style={({ pressed }) => [
          styles.control,
          { borderColor: palette.borderStrong, backgroundColor: palette.surface },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[textStyle('sm'), styles.controlText, { color: palette.ink }]}>
          {condition} · ×{row.quantity}
        </Text>
        <MaterialCommunityIcons name="pencil-outline" size={16} color={palette.textMuted} />
      </Pressable>
      {owned ? (
        <Text
          style={[textStyle('xs'), { color: palette.textMuted }]}
          testID={`import-row-${row.position}-owned`}
        >
          {owned}
        </Text>
      ) : null}
      {deck ? <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{deck}</Text> : null}
      {fromFile ? (
        <Text
          style={[textStyle('xs'), { color: palette.textMuted }]}
          testID={`import-row-${row.position}-source`}
        >
          {fromFile}
        </Text>
      ) : null}
    </>
  );

  return (
    <View
      testID={`import-row-${row.position}`}
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: needsPrinting && !dimmed ? palette.warning : palette.border,
        },
      ]}
    >
      <View style={styles.main}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Import ${title}`}
          accessibilityHint={row.included ? 'Leaves this card out' : 'Puts this card back'}
          aria-checked={row.included}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => onToggle(row)}
          hitSlop={8}
          testID={`import-row-${row.position}-include`}
          style={({ pressed }) => [styles.check, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name={row.included ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={26}
            color={row.included ? palette.primary : palette.textMuted}
          />
        </Pressable>
        <View style={dimmed ? styles.dimmed : undefined}>
          <CardImage src={row.card?.imageUrl} alt="" game={row.card?.game} size="sm" />
        </View>
        {stacked ? null : (
          <View style={styles.text}>
            {heading}
            {controls}
          </View>
        )}
      </View>
      {stacked ? (
        <View style={styles.below} testID={`import-row-${row.position}-below`}>
          {heading}
          {controls}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1 },
  main: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], padding: spacing[2] },
  check: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  unknown: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing[1] },
  below: { gap: spacing[1], paddingHorizontal: spacing[2], paddingBottom: spacing[2] },
  name: { fontWeight: fontWeight.semibold },
  strong: { fontWeight: fontWeight.semibold },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 40,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  controlText: { flex: 1 },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
