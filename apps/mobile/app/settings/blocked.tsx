import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyBlocks, useUnblockUser } from '@/src/api/hooks/blocks';
import type { BlockedUser } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Divider, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Settings → Blocked users (web: `/settings/blocked`, `GET /me/blocks`): the collectors the caller
 * blocked, each with Unblock (`DELETE /users/{id}/block`). Blocked collectors and the caller do not
 * see each other on the map, in search or in the community, and cannot message each other.
 */
export default function BlockedUsersScreen() {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const blocks = useMyBlocks();
  const unblock = useUnblockUser();
  const [busyId, setBusyId] = useState<string | null>(null);

  const release = async (user: BlockedUser) => {
    setBusyId(user.id);
    try {
      await unblock.mutateAsync({ id: user.id });
      snackbar.show(`${user.displayName} is unblocked.`);
    } catch (error) {
      snackbar.show(friendlyMessage(error as Parameters<typeof friendlyMessage>[0]), {
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  let content;
  if (blocks.data) {
    content =
      blocks.data.length === 0 ? (
        <EmptyState
          testID="blocked-empty"
          icon="shield-check-outline"
          title="You have not blocked anyone"
          description="Block a collector from a conversation or a community post when you no longer want to hear from them."
        />
      ) : (
        <View accessibilityLabel="Blocked users" testID="blocked-list">
          {blocks.data.map((user, index) => (
            <View key={user.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row} testID={`blocked-${user.handle}`}>
                <Avatar src={user.avatarUrl} name={user.displayName} size={44} />
                <View style={styles.grow}>
                  <Text
                    style={[textStyle('md'), styles.strong, { color: palette.ink }]}
                    numberOfLines={1}
                  >
                    {user.displayName}
                  </Text>
                  <Text style={[textStyle('sm'), { color: palette.textMuted }]} numberOfLines={1}>
                    @{user.handle} · blocked {relativeTime(user.blockedAt)}
                  </Text>
                </View>
                <Button
                  label="Unblock"
                  icon="lock-open-variant-outline"
                  variant="secondary"
                  loading={busyId === user.id}
                  loadingLabel="Unblocking…"
                  disabled={busyId !== null && busyId !== user.id}
                  accessibilityLabel={`Unblock ${user.displayName}`}
                  onPress={() => void release(user)}
                  style={styles.unblock}
                  testID={`unblock-${user.handle}`}
                />
              </View>
            </View>
          ))}
        </View>
      );
  } else if (blocks.error) {
    content = (
      <ErrorState
        compact
        testID="blocked-error"
        error={blocks.error}
        title="Blocked users could not load"
        onRetry={() => void blocks.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={3} rowHeight={64} testID="blocked-loading" />;
  }

  return (
    <Screen scroll safeBottom testID="screen-settings-blocked">
      <SectionCard
        title="Blocked users"
        description="Blocked collectors cannot message you, and you no longer see each other on the map, in search or in the community. They are never told."
      >
        {content}
      </SectionCard>
      <View style={styles.note}>
        <MaterialCommunityIcons name="information-outline" size={18} color={palette.textMuted} />
        <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>
          Block a collector from the options of a conversation or from a community post.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  unblock: { minHeight: 40, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    marginTop: spacing[4],
    paddingHorizontal: spacing[1],
  },
});
