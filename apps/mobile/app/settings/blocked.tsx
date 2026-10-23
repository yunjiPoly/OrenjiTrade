import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { useMyBlocks, useUnblockUser } from '@/src/api/hooks/blocks';
import type { BlockedUser } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { BLOCKED_COPY as COPY } from '@/src/features/settings/settingsCopy';
import { SettingsGroup } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, useStackedRows, useTheme } from '@/src/theme';

/**
 * Settings › Blocked collectors (stage R13, mockup v50 screen 54; web: `/settings/blocked`,
 * `GET /me/blocks`): who the collector blocked, each with Unblock (`DELETE /users/{id}/block`).
 * Blocked collectors and the collector do not see each other's binders, profiles or posts and
 * cannot message each other; they are never told.
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
      snackbar.show(COPY.unblocked(user.displayName), { icon: 'success' });
    } catch (error) {
      snackbar.show(messageOf(error), { tone: 'error' });
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
          title={COPY.emptyTitle}
          description={COPY.emptyText}
        />
      ) : (
        <SettingsGroup testID="blocked-list">
          {blocks.data.map((user) => (
            <BlockedRow
              key={user.id}
              user={user}
              busy={busyId === user.id}
              disabled={busyId !== null && busyId !== user.id}
              onUnblock={() => void release(user)}
            />
          ))}
        </SettingsGroup>
      );
  } else if (blocks.error) {
    content = (
      <ErrorState
        compact
        testID="blocked-error"
        error={blocks.error}
        title={COPY.loadError}
        onRetry={() => void blocks.refetch()}
      />
    );
  } else {
    content = (
      <View accessibilityLabel={COPY.loading} aria-busy>
        <SkeletonList rows={3} rowHeight={64} testID="blocked-loading" />
      </View>
    );
  }

  return (
    <SettingsPage title={COPY.title} testID="screen-settings-blocked">
      <Text style={[styles.intro, { color: palette.textMuted }]}>{COPY.intro}</Text>
      {content}
      <Text style={[styles.how, { color: palette.settings.chevron }]}>{COPY.how}</Text>
    </SettingsPage>
  );
}

function BlockedRow({
  user,
  busy,
  disabled,
  onUnblock,
}: {
  user: BlockedUser;
  busy: boolean;
  disabled: boolean;
  onUnblock: () => void;
}) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  return (
    <View style={[styles.row, stacked && styles.rowStacked]} testID={`blocked-${user.handle}`}>
      <View style={styles.who}>
        <Avatar src={user.avatarUrl} name={user.displayName} size={40} />
        <View style={styles.words}>
          <Text style={[styles.name, { color: palette.ink }]} numberOfLines={stacked ? 0 : 1}>
            {user.displayName}
          </Text>
          <Text style={[styles.line, { color: palette.textMuted }]} numberOfLines={stacked ? 0 : 1}>
            {COPY.line(user.handle, relativeTime(user.blockedAt))}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.unblockLabel(user.displayName)}
        aria-busy={busy}
        disabled={busy || disabled}
        onPress={onUnblock}
        hitSlop={4}
        testID={`unblock-${user.handle}`}
        style={({ pressed }) => [
          styles.unblock,
          { borderColor: palette.borderStrong },
          (busy || disabled) && styles.inactive,
          pressed && styles.pressed,
        ]}
      >
        {busy ? <ActivityIndicator size="small" color={palette.ink} /> : null}
        <Text style={[styles.unblockText, { color: palette.ink }]}>
          {busy ? COPY.unblocking : COPY.unblock}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20 },
  how: { fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  line: { fontSize: 13, lineHeight: 18 },
  unblock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  unblockText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
