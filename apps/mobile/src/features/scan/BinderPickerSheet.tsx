import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, textStyle, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { REVIEW_COPY } from './scanCopy';
import { SheetCancel } from './SheetParts';

export interface BinderPickerSheetProps {
  visible: boolean;
  /** The collector's binders (`GET /binders`); undefined while they load. */
  binders: readonly BinderResponse[] | undefined;
  error: ApiError | null;
  onRetry: () => void;
  /** The binder chosen now; null: no binder. */
  value: string | null;
  onPick: (binderId: string | null) => void;
  onClose: () => void;
}

/**
 * The review's "No binder" pill opens this list (mockup screen 30): "No binder" and the collector's
 * own binders, a private one tagged so. The rows look like the rarity list's.
 */
export function BinderPickerSheet({
  visible,
  binders,
  error,
  onRetry,
  value,
  onPick,
  onClose,
}: BinderPickerSheetProps) {
  const { palette } = useTheme();
  let list;
  if (!binders && error) {
    list = (
      <ErrorState
        compact
        error={error}
        title={REVIEW_COPY.bindersFailed}
        onRetry={onRetry}
        testID="review-binders-error"
      />
    );
  } else if (!binders) {
    list = <SkeletonList rows={3} rowHeight={48} testID="review-binders-loading" />;
  } else {
    const options: { id: string | null; name: string; isPrivate: boolean }[] = [
      { id: null, name: REVIEW_COPY.noBinder, isPrivate: false },
      ...binders.map((binder) => ({
        id: binder.id,
        name: binder.name,
        isPrivate: binder.visibility === 'PRIVATE',
      })),
    ];
    list = (
      <ScrollView
        accessibilityRole="radiogroup"
        accessibilityLabel={REVIEW_COPY.binderTitle}
        style={styles.list}
        testID="review-binder-list"
      >
        {options.map((option) => {
          const checked = option.id === value;
          return (
            <Pressable
              key={option.id ?? 'none'}
              accessibilityRole="radio"
              accessibilityLabel={
                option.isPrivate ? `${option.name}, ${REVIEW_COPY.privateBinder}` : option.name
              }
              aria-checked={checked}
              onPress={() => onPick(option.id)}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: palette.border },
                pressed && styles.pressed,
              ]}
              testID={`review-binder-${option.id ?? 'none'}`}
            >
              <View
                style={[
                  styles.ring,
                  { borderColor: checked ? palette.primary : palette.textDisabled },
                ]}
              >
                {checked ? (
                  <View style={[styles.dot, { backgroundColor: palette.primary }]} />
                ) : null}
              </View>
              <Text style={[textStyle('md'), styles.label, { color: palette.ink }]}>
                {option.name}
              </Text>
              {option.isPrivate ? (
                <View style={[styles.tag, { backgroundColor: palette.surfaceVariant }]}>
                  <MaterialCommunityIcons name="lock-outline" size={13} color={palette.textMuted} />
                  <Text style={[styles.tagLabel, { color: palette.textMuted }]}>
                    {REVIEW_COPY.privateBinder}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {binders.length === 0 ? (
          <Text
            style={[textStyle('sm'), styles.empty, { color: palette.textMuted }]}
            testID="review-binders-empty"
          >
            {REVIEW_COPY.noBinderYet}
          </Text>
        ) : null}
      </ScrollView>
    );
  }
  return (
    <BottomSheet visible={visible} onClose={onClose} testID="review-binder-sheet">
      <View style={styles.body}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[textStyle('lg'), styles.title, { color: palette.ink }]}
        >
          {REVIEW_COPY.binderTitle}
        </Text>
        {list}
        <SheetCancel onPress={onClose} testID="review-binder-cancel" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[1], flexShrink: 1 },
  title: { fontWeight: fontWeight.bold, marginTop: spacing[1] },
  list: { flexGrow: 0, flexShrink: 1, marginTop: spacing[2] },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  ring: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { flex: 1 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  empty: { paddingVertical: 12, paddingHorizontal: 4 },
  pressed: { opacity: 0.7 },
});
