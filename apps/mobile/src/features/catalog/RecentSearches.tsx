import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  useRecentSearches,
  useRecentSearchesStore,
  type RecentSearchScope,
} from './recentSearchesStore';

export interface RecentSearchesProps {
  uid: string | null;
  /** The segment whose searches are shown (cards by default). */
  scope?: RecentSearchScope;
  onPick: (query: string) => void;
}

/** The collector's recent searches on this device (tap to search again, clear them all). */
export function RecentSearches({ uid, scope = 'cards', onPick }: RecentSearchesProps) {
  const { palette } = useTheme();
  const recent = useRecentSearches(uid, scope);
  const clearScope = useRecentSearchesStore((state) => state.clear);
  const clear = (user: string) => clearScope(user, scope);
  if (!uid || recent.length === 0) {
    return null;
  }
  return (
    <View style={styles.root} testID="recent-searches">
      <View style={styles.head}>
        <Text
          accessibilityRole="header"
          style={[textStyle('sm'), styles.title, { color: palette.ink }]}
        >
          Recent searches
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear recent searches"
          onPress={() => clear(uid)}
          hitSlop={8}
          testID="recent-searches-clear"
        >
          <Text style={[textStyle('sm'), styles.title, { color: palette.accent }]}>Clear</Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        {recent.map((query) => (
          <Pressable
            key={query}
            accessibilityRole="button"
            accessibilityLabel={`Search again for ${query}`}
            onPress={() => onPick(query)}
            testID={`recent-search-${query}`}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: palette.surfaceVariant, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="history" size={16} color={palette.textMuted} />
            <Text style={[textStyle('sm'), { color: palette.ink }]} numberOfLines={1}>
              {query}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontWeight: fontWeight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pressed: { opacity: 0.8 },
});
