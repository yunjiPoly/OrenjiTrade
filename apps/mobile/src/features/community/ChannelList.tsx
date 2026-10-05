import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCommunityChannels } from '@/src/api/hooks/community';
import { useGames } from '@/src/api/hooks/profile';
import type { CommunityChannel } from '@/src/api/types';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { gamesFrom } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { activityLabel, channelIcon, groupChannels } from './communityHelpers';

const ALL = 'all';

function ChannelRow({ channel, onPress }: { channel: CommunityChannel; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${channel.name}, ${activityLabel(channel.postCount24h)}`}
      onPress={onPress}
      testID={`channel-${channel.slug}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: palette.accentContainer }]}>
        <MaterialCommunityIcons
          name={channelIcon(channel.kind)}
          size={20}
          color={palette.onAccentContainer}
        />
      </View>
      <View style={styles.grow}>
        <Text style={[textStyle('md'), styles.name, { color: palette.ink }]}>{channel.name}</Text>
        <Text numberOfLines={1} style={[textStyle('xs'), { color: palette.textMuted }]}>
          {channel.description}
        </Text>
      </View>
      {channel.postCount24h > 0 ? (
        <View
          testID={`channel-count-${channel.slug}`}
          style={[styles.count, { backgroundColor: palette.primaryContainer }]}
        >
          <Text style={[textStyle('xs'), styles.countText, { color: palette.onPrimaryContainer }]}>
            {channel.postCount24h}
          </Text>
        </View>
      ) : null}
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
    </Pressable>
  );
}

/**
 * The public community channels (the web's `/community` sidebar, inside the Messages tab like the
 * web's mobile navigation): a game filter, then channels grouped by region, game-wide and topics,
 * each with its posts of the last 24 hours. Behind the `publicChat` flag: when it is off the API
 * answers 403 `FEATURE_DISABLED` and the community explains it is closed.
 */
export function ChannelList({ onOpenInbox }: { onOpenInbox: () => void }) {
  const { palette } = useTheme();
  const router = useRouter();
  const channels = useCommunityChannels();
  const games = useGames();
  const [game, setGame] = useState<string>(ALL);
  const groups = useMemo(
    () => groupChannels(channels.data ?? [], game === ALL ? null : game),
    [channels.data, game]
  );
  const gameOptions = useMemo(
    () => [
      { value: ALL, label: 'All games' },
      ...gamesFrom(games.data).map((entry) => ({ value: entry.slug, label: entry.label })),
    ],
    [games.data]
  );

  if (!channels.data) {
    if (channels.error?.errorCode === 'FEATURE_DISABLED') {
      return (
        <EmptyState
          testID="community-disabled"
          icon="message-off-outline"
          title="The community is closed right now"
          description="Public channels are turned off for the moment. Private messages still work."
          actionLabel="Open messages"
          onAction={onOpenInbox}
        />
      );
    }
    if (channels.error) {
      return (
        <ErrorState
          testID="community-error"
          error={channels.error}
          title="Channels could not load"
          onRetry={() => void channels.refetch()}
        />
      );
    }
    return (
      <View style={styles.padded} accessibilityLabel="Loading channels" aria-busy>
        <SkeletonList rows={6} rowHeight={56} testID="community-loading" />
      </View>
    );
  }

  return (
    <ScrollView
      testID="community-channels"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={channels.isRefetching}
          onRefresh={() => void channels.refetch()}
        />
      }
    >
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        Public channels by region, game and topic. Ask around, show off new listings and find trades
        near you.
      </Text>
      <ChoiceChips
        label="Filter channels by game"
        hideLabel
        options={gameOptions}
        value={game}
        onChange={setGame}
        scroll
        testID="community-game"
      />
      {groups.length === 0 ? (
        <EmptyState
          testID="community-empty"
          icon="forum-outline"
          title="No channels for this game yet"
          description="Pick another game, or post in a topic channel."
          actionLabel="Show every channel"
          onAction={() => setGame(ALL)}
        />
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text
              accessibilityRole="header"
              style={[textStyle('sm'), styles.groupTitle, { color: palette.textMuted }]}
            >
              {group.label}
            </Text>
            {group.channels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                onPress={() =>
                  router.push({ pathname: '/community/[slug]', params: { slug: channel.slug } })
                }
              />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing[4] },
  content: { padding: spacing[4], gap: spacing[4] },
  group: { gap: spacing[2] },
  groupTitle: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: 2 },
  name: { fontWeight: fontWeight.semibold },
  count: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontWeight: fontWeight.bold },
  pressed: { opacity: 0.8 },
});
