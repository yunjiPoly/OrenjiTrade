import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTagSearch } from '@/src/api/hooks/profile';
import type { TagResponse } from '@/src/api/types';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { MAX_PROFILE_TAGS, customTagCandidate } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface TagPickerProps {
  selected: readonly TagResponse[];
  onSelectedChange: (tags: TagResponse[]) => void;
  customLabels: readonly string[];
  onCustomLabelsChange: (labels: string[]) => void;
  disabled?: boolean;
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

/**
 * Tag chips with search (`GET /tags`): pick curated tags or add custom labels (2–24 characters),
 * up to 12 in total (web: `app-tag-picker`). The parent persists the selection.
 */
export function TagPicker({
  selected,
  onSelectedChange,
  customLabels,
  onCustomLabelsChange,
  disabled,
}: TagPickerProps) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const search = useTagSearch(useDebounced(query, 250));
  const count = selected.length + customLabels.length;
  const full = count >= MAX_PROFILE_TAGS;

  const suggestions = useMemo(() => {
    const chosen = new Set(selected.map((tag) => tag.id));
    return (search.data ?? []).filter((tag) => !chosen.has(tag.id));
  }, [search.data, selected]);

  const candidate = customTagCandidate(query, [
    ...(search.data ?? []).map((tag) => tag.label),
    ...selected.map((tag) => tag.label),
    ...customLabels,
  ]);

  const add = (tag: TagResponse) => {
    if (!full && !disabled) {
      onSelectedChange([...selected, tag]);
    }
  };
  const addCustom = () => {
    if (candidate && !full && !disabled) {
      onCustomLabelsChange([...customLabels, candidate]);
      setQuery('');
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.selected} accessibilityLabel="Your tags">
        {selected.map((tag) => (
          <SelectedChip
            key={tag.id}
            label={tag.label}
            onRemove={() => onSelectedChange(selected.filter((t) => t.id !== tag.id))}
          />
        ))}
        {customLabels.map((label) => (
          <SelectedChip
            key={`custom-${label}`}
            label={label}
            onRemove={() => onCustomLabelsChange(customLabels.filter((value) => value !== label))}
          />
        ))}
      </View>
      <Text testID="tag-count" style={[textStyle('sm'), { color: palette.textMuted }]}>
        {count} / {MAX_PROFILE_TAGS}
      </Text>

      <TextField
        label="Search tags"
        value={query}
        onChangeText={setQuery}
        placeholder="Trader, cube drafter, local meetups…"
        autoCapitalize="none"
        editable={!disabled && !full}
        hint={full ? `You reached the limit of ${MAX_PROFILE_TAGS} tags.` : undefined}
        onSubmitEditing={addCustom}
        testID="tag-search"
      />
      {candidate && !full ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add custom tag ${candidate}`}
          onPress={addCustom}
          style={({ pressed }) => [styles.custom, pressed && styles.pressed]}
          testID="tag-add-custom"
        >
          <MaterialCommunityIcons name="tag-plus-outline" size={18} color={palette.accent} />
          <Text style={[textStyle('sm'), { color: palette.accent }]}>Add “{candidate}”</Text>
        </Pressable>
      ) : null}

      {search.isError && !search.data ? (
        <ErrorState
          compact
          error={search.error}
          title="We could not load the tags"
          onRetry={() => void search.refetch()}
          testID="tag-error"
        />
      ) : search.isPending ? (
        <View style={styles.suggestions} accessibilityLabel="Loading tags">
          <Skeleton width={90} height={32} radius={radius.pill} />
          <Skeleton width={120} height={32} radius={radius.pill} />
          <Skeleton width={80} height={32} radius={radius.pill} />
        </View>
      ) : (
        <View
          accessibilityRole="list"
          accessibilityLabel="Suggested tags"
          style={styles.suggestions}
        >
          {suggestions.length === 0 ? (
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>No matching tags.</Text>
          ) : (
            suggestions.map((tag) => (
              <Pressable
                key={tag.id}
                accessibilityRole="button"
                accessibilityLabel={`Add tag ${tag.label}`}
                disabled={full || disabled}
                onPress={() => add(tag)}
                testID={`tag-suggestion-${tag.slug}`}
                style={({ pressed }) => [
                  styles.suggestion,
                  { borderColor: palette.borderStrong },
                  pressed && styles.pressed,
                  (full || disabled) && styles.disabled,
                ]}
              >
                <MaterialCommunityIcons name="plus" size={16} color={palette.textMuted} />
                <Text style={[textStyle('sm'), { color: palette.ink }]}>{tag.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function SelectedChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: palette.primaryContainer }]}>
      <Text style={[textStyle('sm'), styles.chipLabel, { color: palette.onPrimaryContainer }]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove tag ${label}`}
        onPress={onRemove}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="close" size={16} color={palette.onPrimaryContainer} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  selected: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.pill,
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    paddingVertical: spacing[1],
  },
  chipLabel: { fontWeight: fontWeight.medium },
  custom: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], minHeight: 36 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
