import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ListRow } from '@/src/components/ui/Layout';
import {
  AVAILABILITIES,
  AVAILABILITY_LABELS,
  TEMPORARY_DURATIONS,
  VISIBILITY_INFO,
} from '@/src/lib/inventory';
import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import type { BulkAction } from './bulkActions';

type Menu = 'visibility' | 'duration' | 'binder' | 'availability' | null;

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
 * Actions on the selected cards (the web's `app-bulk-bar`): visibility (private, public, or
 * public for a duration), move to a binder, availability, confirm and delete, with "N selected",
 * select all and clear. Menus open in bottom sheets.
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
  const [menu, setMenu] = useState<Menu>(null);
  const act = (action: BulkAction) => {
    setMenu(null);
    onAction(action);
  };

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Bulk actions"
      aria-busy={busy}
      testID="bulk-bar"
      style={[styles.bar, elevation.floating, { backgroundColor: palette.ink }]}
    >
      <View style={styles.head}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Select all cards on this page"
          aria-checked={allSelected}
          onPress={onToggleAll}
          hitSlop={8}
          testID="bulk-select-all"
          style={styles.check}
        >
          <MaterialCommunityIcons
            name={allSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={palette.background}
          />
        </Pressable>
        <Text
          testID="bulk-count"
          accessibilityLiveRegion="polite"
          style={[textStyle('sm'), styles.count, { color: palette.background }]}
        >
          {count} selected
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
          onPress={onClear}
          hitSlop={8}
          testID="bulk-clear"
          style={styles.check}
        >
          <MaterialCommunityIcons name="close" size={22} color={palette.background} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actions}
        keyboardShouldPersistTaps="handled"
      >
        <Action
          icon="eye-outline"
          label="Visibility"
          disabled={busy}
          onPress={() => setMenu('visibility')}
          testID="bulk-visibility"
        />
        <Action
          icon="book-arrow-right-outline"
          label="Move to binder"
          disabled={busy}
          onPress={() => setMenu('binder')}
          testID="bulk-move"
        />
        <Action
          icon="swap-horizontal"
          label="Availability"
          disabled={busy}
          onPress={() => setMenu('availability')}
          testID="bulk-availability"
        />
        <Action
          icon="check-circle-outline"
          label="Confirm"
          disabled={busy}
          onPress={() => act({ kind: 'confirm' })}
          testID="bulk-confirm"
        />
        <Action
          icon="delete-outline"
          label="Delete"
          tone="danger"
          disabled={busy}
          onPress={() => act({ kind: 'delete' })}
          testID="bulk-delete"
        />
      </ScrollView>

      <BottomSheet
        visible={menu === 'visibility'}
        onClose={() => setMenu(null)}
        title="Visibility"
        testID="bulk-visibility-sheet"
      >
        <ListRow
          icon="lock-outline"
          label="Make private"
          detail={VISIBILITY_INFO.PRIVATE.hint}
          kind="button"
          onPress={() => act({ kind: 'visibility', visibility: 'PRIVATE' })}
          testID="bulk-visibility-PRIVATE"
        />
        <ListRow
          icon="earth"
          label="Make public"
          detail={VISIBILITY_INFO.PUBLIC.hint}
          kind="button"
          onPress={() => act({ kind: 'visibility', visibility: 'PUBLIC' })}
          testID="bulk-visibility-PUBLIC"
        />
        <ListRow
          icon="timer-outline"
          label="Temporarily public"
          detail={VISIBILITY_INFO.TEMPORARILY_PUBLIC.hint}
          onPress={() => setMenu('duration')}
          testID="bulk-visibility-TEMPORARILY_PUBLIC"
        />
      </BottomSheet>
      <BottomSheet
        visible={menu === 'duration'}
        onClose={() => setMenu(null)}
        title="Public for"
        testID="bulk-duration-sheet"
      >
        {TEMPORARY_DURATIONS.map((duration) => (
          <ListRow
            key={duration.value}
            icon="timer-outline"
            label={`Public for ${duration.label}`}
            kind="button"
            onPress={() =>
              act({
                kind: 'visibility',
                visibility: 'TEMPORARILY_PUBLIC',
                duration: duration.value,
              })
            }
            testID={`bulk-duration-${duration.value}`}
          />
        ))}
      </BottomSheet>
      <BottomSheet
        visible={menu === 'binder'}
        onClose={() => setMenu(null)}
        title="Move to binder"
        testID="bulk-binder-sheet"
      >
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          <ListRow
            icon="inbox-outline"
            label="No binder (unfiled)"
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
      <BottomSheet
        visible={menu === 'availability'}
        onClose={() => setMenu(null)}
        title="Availability"
        testID="bulk-availability-sheet"
      >
        {AVAILABILITIES.map((availability) => (
          <ListRow
            key={availability}
            icon="swap-horizontal"
            label={AVAILABILITY_LABELS[availability]}
            kind="button"
            onPress={() => act({ kind: 'availability', availability })}
            testID={`bulk-availability-${availability}`}
          />
        ))}
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
  const color = tone === 'danger' ? '#FCA5A5' : palette.background;
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
  bar: { borderRadius: radius.lg, padding: spacing[2], gap: spacing[1] },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  check: { padding: spacing[1] },
  count: { flex: 1, fontWeight: fontWeight.semibold },
  actions: { flexDirection: 'row', gap: spacing[1] },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 40,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
  },
  actionLabel: { fontWeight: fontWeight.semibold },
  list: { flexGrow: 0 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
