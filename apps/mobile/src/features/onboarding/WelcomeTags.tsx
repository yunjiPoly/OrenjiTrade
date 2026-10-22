import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTagSearch } from '@/src/api/hooks/profile';
import type { TagResponse } from '@/src/api/types';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { MAX_PROFILE_TAGS, customTagCandidate } from '@/src/lib/profile';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

import { ToggleChips, type ToggleChip } from './ToggleChips';
import { WELCOME_COPY } from './welcomeCopy';

export interface WelcomeTagsProps {
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

/** The chips the welcome shows: the picked tags first, then the suggestions not picked. */
export function welcomeTagChips(input: {
  selected: readonly TagResponse[];
  customLabels: readonly string[];
  suggestions: readonly TagResponse[];
}): ToggleChip[] {
  const full = input.selected.length + input.customLabels.length >= MAX_PROFILE_TAGS;
  const chosen = new Set(input.selected.map((tag) => tag.id));
  return [
    ...input.selected.map((tag) => ({
      key: `tag:${tag.id}`,
      label: tag.label,
      selected: true,
      testID: `tag-${tag.slug}`,
    })),
    ...input.customLabels.map((label) => ({
      key: `custom:${label}`,
      label,
      selected: true,
      testID: `tag-custom-${label}`,
    })),
    ...input.suggestions
      .filter((tag) => !chosen.has(tag.id))
      .slice(0, MAX_PROFILE_TAGS)
      .map((tag) => ({
        key: `tag:${tag.id}`,
        label: tag.label,
        selected: false,
        disabled: full,
        testID: `tag-suggestion-${tag.slug}`,
      })),
  ];
}

/**
 * "Tags · optional" of the welcome (mockup v50 screen 41): chips to pick (the suggestions of
 * `GET /tags`, the ones picked filled), at most 12 in all; the field under them searches the tags
 * or adds one's own (2 to 24 characters), as the profile's tag picker does.
 */
export function WelcomeTags({
  selected,
  onSelectedChange,
  customLabels,
  onCustomLabelsChange,
  disabled,
}: WelcomeTagsProps) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const search = useTagSearch(useDebounced(query, 250));
  const full = selected.length + customLabels.length >= MAX_PROFILE_TAGS;
  const chips = useMemo(
    () => welcomeTagChips({ selected, customLabels, suggestions: search.data ?? [] }),
    [customLabels, search.data, selected]
  );
  const candidate = customTagCandidate(query, [
    ...(search.data ?? []).map((tag) => tag.label),
    ...selected.map((tag) => tag.label),
    ...customLabels,
  ]);

  const toggle = (key: string) => {
    if (key.startsWith('custom:')) {
      const label = key.slice('custom:'.length);
      onCustomLabelsChange(customLabels.filter((value) => value !== label));
      return;
    }
    const id = key.slice('tag:'.length);
    if (selected.some((tag) => tag.id === id)) {
      onSelectedChange(selected.filter((tag) => tag.id !== id));
      return;
    }
    const tag = search.data?.find((entry) => entry.id === id);
    if (tag && !full) {
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
      {search.isError && !search.data ? (
        <ErrorState
          compact
          error={search.error}
          title={WELCOME_COPY.games.tagsError}
          onRetry={() => void search.refetch()}
          testID="tag-error"
        />
      ) : search.isPending && chips.length === 0 ? (
        <View
          style={styles.loading}
          accessibilityLabel={WELCOME_COPY.games.tagsLoading}
          testID="tag-loading"
        >
          <Skeleton width={90} height={36} radius={radius.pill} />
          <Skeleton width={120} height={36} radius={radius.pill} />
          <Skeleton width={80} height={36} radius={radius.pill} />
        </View>
      ) : chips.length === 0 ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {WELCOME_COPY.games.noTags}
        </Text>
      ) : (
        <ToggleChips
          label={WELCOME_COPY.games.tagsLabel}
          chips={chips}
          onToggle={toggle}
          disabled={disabled}
          testID="welcome-tags"
        />
      )}
      <Text testID="tag-count" style={[textStyle('xs'), { color: palette.textMuted }]}>
        {full
          ? WELCOME_COPY.games.tagsFull(MAX_PROFILE_TAGS)
          : `${selected.length + customLabels.length} / ${MAX_PROFILE_TAGS}`}
      </Text>
      <TextField
        label={WELCOME_COPY.games.tagSearch}
        value={query}
        onChangeText={setQuery}
        placeholder={WELCOME_COPY.games.tagSearchPlaceholder}
        autoCapitalize="none"
        editable={!disabled && !full}
        onSubmitEditing={addCustom}
        testID="tag-search"
      />
      {candidate && !full ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={WELCOME_COPY.games.addTagName(candidate)}
          onPress={addCustom}
          style={({ pressed }) => [styles.custom, pressed && styles.pressed]}
          testID="tag-add-custom"
        >
          <MaterialCommunityIcons name="tag-plus-outline" size={18} color={palette.accent} />
          <Text style={[textStyle('sm'), { color: palette.accent }]}>
            {WELCOME_COPY.games.addTag(candidate)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  loading: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  custom: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], minHeight: 44 },
  pressed: { opacity: 0.7 },
});
