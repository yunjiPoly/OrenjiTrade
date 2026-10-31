import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useCommunityRooms } from '@/src/api/hooks/community';
import { useRegionOptions } from '@/src/api/hooks/regions';
import type { CommunityChannel } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { StateScroll } from '@/src/components/ui/StateScroll';
import { Text } from '@/src/components/ui/Text';
import { GameTile } from '@/src/features/games/GameTile';
import { useBrowsingGame } from '@/src/features/games/browsingGame';
import { inboxTime } from '@/src/features/messages/dealRules';
import { RegionBar } from '@/src/features/regions/RegionBar';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { regionName } from '@/src/lib/place';
import { fontWeight, spacing, useTheme } from '@/src/theme';

import { ROOMS_COPY } from './communityCopy';
import { isRoomUnread, orderRooms, roomPreview } from './communityHelpers';
import { useRoomVisits } from './roomVisits';

function RoomRow({
  room,
  region,
  unread,
  onPress,
}: {
  room: CommunityChannel;
  region: string;
  unread: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const preview = roomPreview(room.lastPost);
  const when = room.lastPost ? inboxTime(room.lastPost.createdAt) : '';
  // One line each as in the mockup; at large text sizes the time goes under the name and the last
  // post takes two lines (side by side, the name was cut after a few letters).
  const large = useWindowDimensions().fontScale > 1.3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ROOMS_COPY.rowLabel({ name: room.name, region, preview, when, unread })}
      onPress={onPress}
      testID={`room-${room.slug}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <GameTile slug={room.game ?? ''} name={room.name} size={46} />
      <View style={styles.main}>
        <View style={large ? styles.nameRowLarge : styles.nameRow}>
          <Text
            numberOfLines={large ? 3 : 1}
            style={[styles.name, large && styles.nameLarge, { color: palette.ink }]}
          >
            {room.name}
          </Text>
          {when ? (
            <Text
              testID={`room-time-${room.slug}`}
              style={[styles.time, { color: unread ? palette.primary : palette.textDisabled }]}
            >
              {when}
            </Text>
          ) : null}
        </View>
        <View style={styles.bottom}>
          <Text
            numberOfLines={large ? 2 : 1}
            testID={`room-preview-${room.slug}`}
            style={[
              styles.preview,
              unread && styles.previewUnread,
              {
                color: unread ? palette.ink : preview ? palette.textMuted : palette.textDisabled,
              },
            ]}
          >
            {preview ?? ROOMS_COPY.noPosts}
          </Text>
          {unread ? (
            <View
              testID={`room-unread-${room.slug}`}
              accessibilityLabel={ROOMS_COPY.newPosts}
              style={[styles.unreadDot, { backgroundColor: palette.primary }]}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Messages › Community (stage R11, owner prompt 2026-10-20, mockup v50 screen 32): the region pill
 * (the browsed region, "Not your region. Back to …" under it while away), then the five rooms of
 * that region, the browsed game's room first, then the others in the games' order. Each row: the
 * game's tile and name, the last post ("{handle}: {text}", one line) and its time, bold with an
 * orange dot when someone posted after the collector's last visit on this phone; "No posts yet.
 * Say hi!" when empty. At the end: who can read these rooms. Pull to refresh; skeleton rows, an
 * error with "Try again", and the closed state while the `publicChat` flag is off.
 */
export function RoomList({ onOpenChats }: { onOpenChats: () => void }) {
  const { palette } = useTheme();
  const router = useRouter();
  const { region, ready } = useBrowsingRegion();
  const options = useRegionOptions();
  const name = options.find((option) => option.code === region)?.name ?? regionName(region);
  const browsing = useBrowsingGame();
  // Asked once the region and the game are settled (the collector's home region or the one
  // picked, the browsed game), so a collector of Europe never sees Americas (North)'s rooms first
  // and the rows never move once shown.
  const rooms = useCommunityRooms(region, ready && browsing.ready);
  const { visits } = useRoomVisits();
  const gameOrder = useMemo(
    () => browsing.options.map((option) => option.slug),
    [browsing.options]
  );
  const ordered = useMemo(
    () => orderRooms(rooms.data ?? [], browsing.game, gameOrder),
    [rooms.data, browsing.game, gameOrder]
  );

  const top = (
    <View style={styles.top}>
      <RegionBar pinned testID="community-region" />
    </View>
  );

  // Closed, even when rooms were shown before: a refresh that finds the community switched off
  // hides them (review fix 1: the cached rooms and their last posts stayed on screen). It scrolls:
  // centred, it ran over the title and the tabs at the largest text size (review fix 2).
  if (rooms.error?.errorCode === 'FEATURE_DISABLED') {
    return (
      <StateScroll testID="community-state">
        <EmptyState
          testID="community-disabled"
          icon="message-off-outline"
          title={ROOMS_COPY.closedTitle}
          description={ROOMS_COPY.closedBody}
          actionLabel={ROOMS_COPY.closedAction}
          onAction={onOpenChats}
        />
      </StateScroll>
    );
  }

  if (!rooms.data) {
    if (rooms.error) {
      return (
        <StateScroll testID="community-state">
          {top}
          <ErrorState
            testID="community-error"
            error={rooms.error}
            title={ROOMS_COPY.loadError}
            onRetry={() => void rooms.refetch()}
          />
        </StateScroll>
      );
    }
    return (
      <View style={styles.fill}>
        {top}
        <View style={styles.padded} accessibilityLabel={ROOMS_COPY.loading} aria-busy>
          <SkeletonList rows={5} rowHeight={56} testID="community-loading" />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      testID="community-rooms"
      accessibilityLabel={ROOMS_COPY.list(name)}
      data={ordered}
      keyExtractor={(room) => room.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={rooms.isRefetching} onRefresh={() => void rooms.refetch()} />
      }
      ListHeaderComponent={top}
      renderItem={({ item }) => (
        <RoomRow
          room={item}
          region={name}
          unread={isRoomUnread(item.lastPost, visits[item.slug])}
          onPress={() =>
            router.push({ pathname: '/community/[slug]', params: { slug: item.slug } })
          }
        />
      )}
      ListEmptyComponent={
        <EmptyState
          testID="community-empty"
          icon="forum-outline"
          title={ROOMS_COPY.emptyTitle(name)}
          description={ROOMS_COPY.emptyBody}
        />
      }
      ListFooterComponent={
        ordered.length > 0 ? (
          <View style={styles.note} testID="community-footnote">
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={15}
              color={palette.accent}
              style={styles.noteIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[styles.noteText, { color: palette.textMuted }]}>
              {ROOMS_COPY.footnote(name)}
            </Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { padding: spacing[4] },
  content: { flexGrow: 1, paddingBottom: spacing[6] },
  top: { paddingHorizontal: spacing[4], paddingTop: 14, paddingBottom: spacing[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
  nameRowLarge: { gap: 2 },
  name: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  nameLarge: { flex: 0 },
  time: { fontSize: 12, lineHeight: 16 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  preview: { flex: 1, fontSize: 13, lineHeight: 18 },
  previewUnread: { fontWeight: fontWeight.semibold },
  unreadDot: { width: 9, height: 9, borderRadius: 5 },
  note: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.8 },
});
