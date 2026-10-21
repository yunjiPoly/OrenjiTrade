import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { PINNED_MAX_FONT_SCALE, fontWeight, spacing, useTheme } from '@/src/theme';

import {
  FEED_FILTERS,
  chipDot,
  sectionTitle,
  type FeedFilter,
  type FeedSection,
} from './feedRules';
import { HOME_COPY } from './homeCopy';
import { useDotColor } from './HomePosts';

/**
 * The parts of Home around the posts (mockup v50 screens 10, 10b and 10c): the field, the chips,
 * the section titles, the end, the empty and quiet states, the skeleton and the errors.
 */

/** "Search cards or collectors": looks like a field, opens Search with the keyboard up. */
export function HomeSearchField({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={HOME_COPY.searchField}
      accessibilityHint={HOME_COPY.searchHint}
      onPress={onPress}
      testID="home-search-field"
      style={({ pressed }) => [
        styles.field,
        { backgroundColor: palette.surface, borderColor: palette.home.chipBorder },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={20} color={palette.textMuted} />
      <Text numberOfLines={1} style={[styles.fieldText, { color: palette.textMuted }]}>
        {HOME_COPY.searchField}
      </Text>
    </Pressable>
  );
}

/**
 * The chips All, New cards, Wanted, Deck cores (a kind chip has its kind's dot); the selected one
 * is filled light with dark text and announced as selected. They stay on screen above the feed,
 * so their text follows the system size only a little; the row scrolls sideways when it must.
 */
export function FeedChips({
  value,
  onChange,
}: {
  value: FeedFilter;
  onChange: (filter: FeedFilter) => void;
}) {
  const { palette } = useTheme();
  const dotColor = useDotColor();
  return (
    <View style={[styles.chipsBar, { backgroundColor: palette.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={HOME_COPY.chipsLabel}
        contentContainerStyle={styles.chips}
        testID="home-chips"
      >
        {FEED_FILTERS.map((filter) => {
          const selected = filter === value;
          const dot = chipDot(filter);
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityLabel={HOME_COPY.chips[filter]}
              accessibilityState={{ selected }}
              onPress={() => onChange(filter)}
              testID={`home-chip-${filter}`}
              style={({ pressed }) => [
                styles.chip,
                selected
                  ? { backgroundColor: palette.ink, borderColor: palette.ink }
                  : { backgroundColor: 'transparent', borderColor: palette.home.chipBorder },
                pressed && styles.pressed,
              ]}
            >
              {dot ? <View style={[styles.dot, { backgroundColor: dotColor(dot) }]} /> : null}
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[
                  styles.chipText,
                  { color: selected ? palette.background : palette.home.chipText },
                ]}
              >
                {HOME_COPY.chips[filter]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** "Today", "Earlier this week", "Earlier this month". */
export function FeedSectionTitle({ section }: { section: FeedSection }) {
  const { palette } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.section, { color: palette.textMuted }]}
      testID={`home-section-${section}`}
    >
      {sectionTitle(section).toUpperCase()}
    </Text>
  );
}

/** The end of the feed: the teal check, "You're all caught up", the text, "Explore the map". */
export function FeedEnd({ text, onMap }: { text: string; onMap: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={styles.end} testID="home-end">
      <View
        style={[styles.check, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <MaterialCommunityIcons name="check" size={22} color={palette.accent} />
      </View>
      <Text accessibilityRole="header" style={[styles.endTitle, { color: palette.ink }]}>
        {HOME_COPY.end.title}
      </Text>
      <Text style={[styles.endText, { color: palette.textMuted }]} testID="home-end-text">
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HOME_COPY.end.map}
        onPress={onMap}
        testID="home-end-map"
        style={({ pressed }) => [
          styles.mapButton,
          { borderColor: palette.borderStrong },
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons name="map-outline" size={18} color={palette.ink} />
        <Text style={[styles.mapText, { color: palette.ink }]}>{HOME_COPY.end.map}</Text>
      </Pressable>
    </View>
  );
}

/** Nothing in the window (10c): the dashed box, with "Add cards" when Get started is not shown. */
export function QuietBox({ title, onAddCards }: { title: string; onAddCards?: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.quiet, { borderColor: palette.borderStrong }]} testID="home-quiet">
      <View
        style={[
          styles.quietIcon,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <MaterialCommunityIcons name="cards-outline" size={24} color={palette.textMuted} />
      </View>
      <Text accessibilityRole="header" style={[styles.quietTitle, { color: palette.ink }]}>
        {title}
      </Text>
      <Text style={[styles.quietText, { color: palette.textMuted }]}>{HOME_COPY.empty.text}</Text>
      {onAddCards ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={HOME_COPY.empty.addCards}
          onPress={onAddCards}
          testID="home-quiet-add"
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: palette.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.addText, { color: palette.onPrimary }]}>
            {HOME_COPY.empty.addCards}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Nothing for one chip: "No new cards in {region} in the last 30 days." and "Show all". */
export function ChipEmpty({ text, onShowAll }: { text: string; onShowAll: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={styles.chipEmpty} testID="home-chip-empty">
      <Text style={[styles.chipEmptyText, { color: palette.textMuted }]}>{text}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HOME_COPY.chipEmpty.showAll}
        onPress={onShowAll}
        hitSlop={8}
        testID="home-chip-empty-all"
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={[styles.linkText, { color: palette.accent }]}>
          {HOME_COPY.chipEmpty.showAll}
        </Text>
      </Pressable>
    </View>
  );
}

/** The first load: two post outlines (a circle and two lines) and four card-shaped boxes. */
export function FeedSkeleton() {
  const { palette } = useTheme();
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLabel={HOME_COPY.loading}
      aria-busy
      testID="home-loading"
    >
      {[0, 1].map((index) => (
        <View
          key={index}
          style={[
            styles.skeletonPost,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.skeletonHeader}>
            <Skeleton width={36} height={36} radius={18} />
            <View style={styles.skeletonLines}>
              <Skeleton width="70%" height={12} radius={6} />
              <Skeleton width="40%" height={10} radius={5} />
            </View>
          </View>
          <View style={styles.skeletonCards}>
            {[0, 1, 2, 3].map((card) => (
              <View key={card} style={styles.skeletonCard}>
                <Skeleton height={100} radius={6} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** "Couldn't load more" with "Try again", at the bottom; a spinner while the next page loads. */
export function FeedFooter({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { palette } = useTheme();
  if (loading) {
    return (
      <View style={styles.footer} testID="home-more-loading">
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }
  if (!failed) {
    return null;
  }
  return (
    <View style={styles.moreError} testID="home-more-error">
      <Text style={[styles.moreErrorText, { color: palette.ink }]}>{HOME_COPY.moreError}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${HOME_COPY.moreError}. ${HOME_COPY.retry}`}
        onPress={onRetry}
        hitSlop={8}
        testID="home-more-retry"
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={[styles.linkText, { color: palette.accent }]}>{HOME_COPY.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  fieldText: { flex: 1, fontSize: 15, lineHeight: 20 },
  chipsBar: { paddingVertical: spacing[3] },
  chips: { flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[4] },
  chip: {
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  section: {
    marginTop: spacing[2],
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
  },
  end: {
    marginTop: 14,
    paddingTop: spacing[5],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    alignItems: 'center',
    gap: spacing[2],
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold, textAlign: 'center' },
  endText: { maxWidth: 300, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mapButton: {
    marginTop: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  mapText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  quiet: {
    paddingVertical: 28,
    paddingHorizontal: spacing[5],
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: spacing[2],
  },
  quietIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietTitle: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  quietText: { maxWidth: 300, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  addButton: {
    marginTop: spacing[2],
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.bold },
  chipEmpty: { paddingVertical: spacing[6], alignItems: 'center', gap: spacing[2] },
  chipEmptyText: { maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[2] },
  linkText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  skeleton: { gap: 10 },
  skeletonPost: { borderRadius: 16, borderWidth: 1, padding: spacing[3], gap: spacing[3] },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeletonLines: { flex: 1, gap: 6 },
  skeletonCards: { flexDirection: 'row', gap: spacing[2] },
  skeletonCard: { flex: 1 },
  footer: { paddingVertical: spacing[4], alignItems: 'center' },
  moreError: {
    paddingVertical: spacing[3],
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing[2],
  },
  moreErrorText: { fontSize: 14, lineHeight: 19 },
  pressed: { opacity: 0.75 },
});
