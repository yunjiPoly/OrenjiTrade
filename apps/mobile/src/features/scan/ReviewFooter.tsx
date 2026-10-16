import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { addButtonLabel, REVIEW_COPY, toCheckWarning } from './scanCopy';
import type { ScanCounts } from './scanSession';
import type { ScanVisibility } from './types';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface ReviewFooterProps {
  counts: ScanCounts;
  visibility: ScanVisibility;
  onToggleVisibility: () => void;
  /** The binder chosen, by name; null: no binder. */
  binderName: string | null;
  onBinder: () => void;
  /** Photos are still read: the add waits for them, and its button says so. */
  reading: boolean;
  saving: boolean;
  onAdd: () => void;
}

/**
 * The bottom of the review (mockup screen 30): the line about the cards to check, the two pills
 * ("Private"/"Public" and "No binder"), "Add {n} cards to inventory" (off, "Nothing ready to add",
 * when nothing is ready; off, "Wait until every photo is read", while photos are read) and "Add
 * prices and photos later by tapping a card in Inventory." It stays on screen: its words follow
 * the text size as far as the pinned scale.
 */
export function ReviewFooter({
  counts,
  visibility,
  onToggleVisibility,
  binderName,
  onBinder,
  reading,
  saving,
  onAdd,
}: ReviewFooterProps) {
  const { palette } = useTheme();
  const warning = toCheckWarning(counts);
  const isPrivate = visibility === 'PRIVATE';
  return (
    <>
      {warning ? (
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.warning, { color: palette.warning }]}
          testID="review-warning"
        >
          {warning}
        </Text>
      ) : null}
      <View style={styles.pills}>
        <Pill
          icon={isPrivate ? 'lock-outline' : 'earth'}
          label={isPrivate ? REVIEW_COPY.private : REVIEW_COPY.public}
          accessibilityLabel={isPrivate ? REVIEW_COPY.privateLabel : REVIEW_COPY.publicLabel}
          disabled={saving}
          onPress={onToggleVisibility}
          testID="review-visibility"
        />
        <Pill
          icon="book-outline"
          label={binderName ?? REVIEW_COPY.noBinder}
          accessibilityLabel={REVIEW_COPY.binderLabel(binderName)}
          disabled={saving}
          onPress={onBinder}
          testID="review-binder"
        />
      </View>
      <PillButton
        label={reading ? REVIEW_COPY.waitForReading : addButtonLabel(counts)}
        loading={saving}
        loadingLabel={REVIEW_COPY.adding}
        disabled={counts.ready === 0 || reading}
        onPress={onAdd}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="review-add"
      />
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.footer, { color: palette.textMuted }]}
      >
        {REVIEW_COPY.footer}
      </Text>
    </>
  );
}

function Pill({
  icon,
  label,
  accessibilityLabel,
  disabled,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: palette.borderStrong, backgroundColor: palette.surface },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <MaterialCommunityIcons name={icon} size={16} color={palette.ink} />
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.pillLabel, { color: palette.ink }]}
      >
        {label}
      </Text>
      <MaterialCommunityIcons name="chevron-down" size={16} color={palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  warning: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillLabel: { flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: fontWeight.semibold },
  footer: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
