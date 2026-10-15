import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ListRow } from '@/src/components/ui/Layout';
import { Text } from '@/src/components/ui/Text';
import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import type { BulkAction } from './bulkActions';
import { BULK_COPY } from './inventoryCopy';

export interface BulkBarProps {
  count: number;
  allSelected: boolean;
  busy: boolean;
  binders: readonly BinderResponse[];
  onAction: (action: BulkAction) => void;
  onToggleAll: () => void;
  onClear: () => void;
}

/**
 * Actions on the selected cards (owner spec 2026-10-14, section 6, Select mode): Move to binder,
 * Make public, Make private, Still available and Delete, with "{n} selected", select all and
 * clear. The binders open in a bottom sheet.
 */
export function BulkBar({
  count,
  allSelected,
  busy,
  binders,
  onAction,
  onToggleAll,
  onClear,
}: BulkBarProps) {
  const { palette } = useTheme();
  const [moving, setMoving] = useState(false);
  const act = (action: BulkAction) => {
    setMoving(false);
    onAction(action);
  };

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Bulk actions"
      aria-busy={busy}
      testID="bulk-bar"
      style={[
        styles.bar,
        elevation.floating,
        { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong },
      ]}
    >
      <View style={styles.head}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={BULK_COPY.selectAll}
          aria-checked={allSelected}
          onPress={onToggleAll}
          hitSlop={8}
          testID="bulk-select-all"
          style={styles.check}
        >
          <MaterialCommunityIcons
            name={allSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={allSelected ? palette.primary : palette.ink}
          />
        </Pressable>
        <Text
          testID="bulk-count"
          accessibilityLiveRegion="polite"
          style={[textStyle('sm'), styles.count, { color: palette.ink }]}
        >
          {BULK_COPY.selected(count)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={BULK_COPY.clear}
          onPress={onClear}
          hitSlop={8}
          testID="bulk-clear"
          style={styles.check}
        >
          <MaterialCommunityIcons name="close" size={22} color={palette.ink} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actions}
        keyboardShouldPersistTaps="handled"
      >
        <Action
          icon="book-arrow-right-outline"
          label={BULK_COPY.move}
          disabled={busy}
          onPress={() => setMoving(true)}
          testID="bulk-move"
        />
        <Action
          icon="earth"
          label={BULK_COPY.makePublic}
          disabled={busy}
          onPress={() => act({ kind: 'visibility', visibility: 'PUBLIC' })}
          testID="bulk-visibility-PUBLIC"
        />
        <Action
          icon="lock-outline"
          label={BULK_COPY.makePrivate}
          disabled={busy}
          onPress={() => act({ kind: 'visibility', visibility: 'PRIVATE' })}
          testID="bulk-visibility-PRIVATE"
        />
        <Action
          icon="check-circle-outline"
          label={BULK_COPY.stillAvailable}
          disabled={busy}
          onPress={() => act({ kind: 'confirm' })}
          testID="bulk-confirm"
        />
        <Action
          icon="delete-outline"
          label={BULK_COPY.delete}
          tone="danger"
          disabled={busy}
          onPress={() => act({ kind: 'delete' })}
          testID="bulk-delete"
        />
      </ScrollView>

      <BottomSheet
        visible={moving}
        onClose={() => setMoving(false)}
        title={BULK_COPY.moveTitle}
        testID="bulk-binder-sheet"
      >
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          <ListRow
            icon="inbox-outline"
            label={BULK_COPY.noBinder}
            kind="button"
            onPress={() => act({ kind: 'move', binderId: null, binderName: null })}
            testID="bulk-binder-unfiled"
          />
          {binders.map((binder) => (
            <ListRow
              key={binder.id}
              icon="book-open-page-variant-outline"
              label={binder.name}
              kind="button"
              onPress={() => act({ kind: 'move', binderId: binder.id, binderName: binder.name })}
              testID={`bulk-binder-${binder.id}`}
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function Action({
  icon,
  label,
  tone = 'default',
  disabled,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  tone?: 'default' | 'danger';
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  const color = tone === 'danger' ? palette.danger : palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        { borderColor: palette.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text style={[textStyle('sm'), styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radius.lg, borderWidth: 1, padding: spacing[2], gap: spacing[1] },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  check: { padding: spacing[2] },
  count: { flex: 1, fontWeight: fontWeight.semibold },
  actions: { flexDirection: 'row', gap: spacing[2], paddingVertical: 2 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actionLabel: { fontWeight: fontWeight.semibold },
  list: { flexGrow: 0 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
