import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { ImportRow } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, useTheme } from '@/src/theme';

import { IMPORT_COPY } from './importCopy';
import {
  conditionShort,
  ownedText,
  plural,
  rowConditionText,
  rowCopyLabel,
  rowLine,
  rowSourceText,
  rowStateText,
  rowSummary,
  rowTitle,
  unmatchedNextStep,
  assumedCopyText,
  deckText,
  matchedSourceText,
} from './importLabels';

/**
 * From this text size on a line is laid out in two storeys: the picture, the copies and the tick
 * box on top, the name and its lines under them across the whole width (next to the picture a
 * text is half the screen wide, and at the accessibility sizes "Clockwork" broke in mid-word).
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
  /** A line of a finished import (Import done): read only, nothing to press. */
  readOnly?: boolean;
  /**
   * Another line of the list is the same card (two artworks of one card in a deck, one card in
   * two conditions in a CSV): what the file said is written under it, so the two can be told
   * apart.
   */
  showSource?: boolean;
}

/**
 * One line of "Check the cards" (mockup v50 screen 67, stage R14): the card's picture, its name,
 * one line under it ("ROTA-EN006 · Super Rare", "Which copy? 2 printings" in amber, "Not
 * recognised. It stays out." in red), the copies and the tick box that puts it in or leaves it
 * out. The name and its line open the "Which copy" chooser; the copies ("NM ×3") open the
 * condition and copies. A third small line says what matters when there is something: left out,
 * its deck section switched off, cards already owned. A line nothing fits shows what the file
 * said and has no control. Each control is named with the card for VoiceOver.
 */
export const ImportRowCard = memo(function ImportRowCard({
  row,
  onChoosePrinting,
  onEdit,
  onToggle,
  disabled = false,
  readOnly = false,
  showSource = false,
}: ImportRowCardProps) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACKED_ROW_FONT_SCALE;
  const title = rowTitle(row);
  const line = rowLine(row);
  const lineColor =
    line.tone === 'danger'
      ? palette.danger
      : line.tone === 'warning'
        ? palette.warning
        : palette.textMuted;

  if (row.status === 'UNMATCHED') {
    const said = rowSourceText(row);
    // What the file said (when the name is not already it) and where it stood in the deck.
    const fileSaid = [said && said !== title ? said : null, deckText(row.deck)]
      .filter(Boolean)
      .join(' · ');
    return (
      <View
        accessible
        accessibilityLabel={rowSummary(row)}
        testID={`import-row-${row.position}`}
        style={[styles.row, { borderBottomColor: palette.border }]}
      >
        <View
          style={[styles.unknown, { borderColor: palette.borderStrong }]}
          accessibilityElementsHidden
        >
          <MaterialCommunityIcons name="help" size={18} color={palette.textMuted} />
        </View>
        <View style={styles.words}>
          <Text
            numberOfLines={stacked ? undefined : 1}
            style={[styles.name, { color: palette.ink }]}
            testID={`import-row-${row.position}-name`}
          >
            {title}
          </Text>
          <Text style={[styles.line, { color: lineColor }]}>{line.text}</Text>
          {fileSaid ? (
            <Text style={[styles.extra, { color: palette.textMuted }]}>{fileSaid}</Text>
          ) : null}
          <Text
            style={[styles.extra, { color: palette.textMuted }]}
            testID={`import-row-${row.position}-next`}
          >
            {unmatchedNextStep(row.unmatchedReason)}
          </Text>
        </View>
      </View>
    );
  }

  const state = rowStateText(row);
  const owned = ownedText(row);
  const assumed = row.status === 'CHOOSE_PRINTING' ? null : assumedCopyText(row);
  const dimmed = !row.included || !row.inScope;
  const condition = rowConditionText(row);
  const copies = plural(row.quantity, 'copy', 'copies');
  const extra = state ?? owned;
  const fromFile = showSource ? matchedSourceText(row) : null;

  const words = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Which copy of ${title}: ${rowCopyLabel(row)}${assumed ? ' (taken as the plain copy: check it)' : ''}`}
      accessibilityHint="Opens the printings of this card"
      aria-disabled={disabled || readOnly}
      disabled={disabled || readOnly}
      onPress={() => onChoosePrinting(row)}
      testID={`import-row-${row.position}-printing`}
      style={({ pressed }) => [styles.words, pressed && styles.pressed]}
    >
      <Text
        numberOfLines={stacked ? undefined : 1}
        style={[styles.name, { color: palette.ink }]}
        testID={`import-row-${row.position}-name`}
      >
        {title}
      </Text>
      <Text
        numberOfLines={stacked ? undefined : 1}
        style={[styles.line, { color: lineColor }]}
        testID={`import-row-${row.position}-line`}
      >
        {line.text}
      </Text>
      {extra ? (
        <Text
          style={[styles.extra, { color: palette.textMuted }]}
          testID={`import-row-${row.position}-${state ? 'state' : 'owned'}`}
        >
          {extra}
        </Text>
      ) : null}
      {fromFile ? (
        <Text
          style={[styles.extra, { color: palette.textMuted }]}
          testID={`import-row-${row.position}-source`}
        >
          {fromFile}
        </Text>
      ) : null}
    </Pressable>
  );

  const controls = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={IMPORT_COPY.copiesLabel(title, condition, copies)}
        accessibilityHint="Opens the condition and the number of copies"
        aria-disabled={disabled || readOnly}
        disabled={disabled || readOnly}
        onPress={() => onEdit(row)}
        hitSlop={6}
        testID={`import-row-${row.position}-edit`}
        style={({ pressed }) => [styles.copies, pressed && styles.pressed]}
      >
        <Text style={[styles.copiesText, { color: palette.settings.segmentText }]}>
          {conditionShort(row.condition)} ×{row.quantity}
        </Text>
      </Pressable>
      {readOnly ? null : (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`${row.included ? 'Leave out' : 'Include'} ${title}`}
          accessibilityHint={row.included ? 'Leaves this card out' : 'Puts this card back'}
          aria-checked={row.included}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => onToggle(row)}
          testID={`import-row-${row.position}-include`}
          style={({ pressed }) => [styles.check, pressed && styles.pressed]}
        >
          <View
            style={[
              styles.box,
              {
                borderColor: row.included ? palette.primary : palette.textDisabled,
                backgroundColor: row.included ? palette.primary : 'transparent',
              },
            ]}
          >
            {row.included ? (
              <MaterialCommunityIcons name="check" size={15} color={palette.onPrimary} />
            ) : null}
          </View>
        </Pressable>
      )}
    </>
  );

  const picture = (
    <View style={dimmed ? styles.dimmed : undefined}>
      <CardImage
        src={row.card?.imageUrl}
        alt=""
        game={row.card?.game}
        size="xs"
        style={styles.picture}
      />
    </View>
  );

  return (
    <View
      testID={`import-row-${row.position}`}
      style={[styles.row, stacked && styles.rowStacked, { borderBottomColor: palette.border }]}
    >
      {stacked ? (
        <>
          <View style={styles.top}>
            {picture}
            <View style={styles.grow} />
            {controls}
          </View>
          <View
            style={dimmed ? styles.dimmedWords : undefined}
            testID={`import-row-${row.position}-below`}
          >
            {words}
          </View>
        </>
      ) : (
        <>
          {picture}
          <View style={[styles.grow, dimmed && styles.dimmedWords]}>{words}</View>
          {controls}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  words: { flex: 1, minWidth: 0, gap: 3, paddingVertical: 4 },
  picture: { width: 40, height: 58, borderRadius: 5 },
  unknown: {
    width: 40,
    height: 58,
    borderRadius: 5,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  line: { fontSize: 12, lineHeight: 16 },
  extra: { fontSize: 12, lineHeight: 16 },
  copies: { minHeight: 44, justifyContent: 'center' },
  copiesText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.5 },
  dimmedWords: { opacity: 0.6 },
  pressed: { opacity: 0.7 },
});
