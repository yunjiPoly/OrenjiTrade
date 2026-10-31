import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { TYPING_COPY } from '@/src/features/search/searchCopy';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import {
  useRecentSearches,
  useRecentSearchesStore,
  useRemembersSearches,
} from './recentSearchesStore';

export interface RecentSearchesProps {
  uid: string | null;
  onPick: (query: string) => void;
}

/**
 * The empty box of the card search (mockup screen 12): "Recent searches" with "Clear", up to 8 of
 * the collector's searches on this device (a tap searches again), and the line saying that only
 * they see them. Nothing while "Remember my searches" is off (Settings › Privacy).
 */
export function RecentSearches({ uid, onPick }: RecentSearchesProps) {
  const { palette } = useTheme();
  const recent = useRecentSearches(uid);
  const remembering = useRemembersSearches(uid);
  const clear = useRecentSearchesStore((state) => state.clear);
  if (!uid || !remembering) {
    return null;
  }
  return (
    <View style={styles.root} testID="recent-searches">
      {recent.length > 0 ? (
        <>
          <View style={styles.head}>
            <Text
              accessibilityRole="header"
              style={[textStyle('md', 'heading'), styles.title, { color: palette.ink }]}
            >
              {TYPING_COPY.recent}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TYPING_COPY.clearRecentLabel}
              onPress={() => clear(uid)}
              hitSlop={12}
              testID="recent-searches-clear"
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <Text style={[textStyle('sm'), styles.title, { color: palette.primary }]}>
                {TYPING_COPY.clearRecent}
              </Text>
            </Pressable>
          </View>
          {recent.map((query) => (
            <Pressable
              key={query}
              accessibilityRole="button"
              accessibilityLabel={TYPING_COPY.searchAgain(query)}
              onPress={() => onPick(query)}
              testID={`recent-search-${query}`}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: palette.border },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons name="history" size={18} color={palette.textMuted} />
              <Text
                style={[textStyle('md'), styles.grow, { color: palette.ink }]}
                numberOfLines={1}
              >
                {query}
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}
      <Text
        style={[textStyle('sm'), styles.note, { color: palette.textMuted }]}
        testID="recent-searches-privacy"
      >
        {TYPING_COPY.privacy}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[1] },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  title: { fontWeight: fontWeight.semibold },
  clear: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1 },
  note: { marginTop: spacing[3] },
  pressed: { opacity: 0.75 },
});
