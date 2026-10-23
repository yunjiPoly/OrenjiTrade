import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { useMyLocation } from '@/src/api/hooks/location';
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from '@/src/api/hooks/notifications';
import type { NotificationSettingsResponse } from '@/src/api/types';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import {
  CHANNELS,
  categoriesOf,
  cellLabel,
  deviceTimeZone,
  quietHoursError,
  type Channel,
  type MasterKey,
} from '@/src/features/settings/notificationOptions';
import { NOTIFICATION_SETTINGS_COPY as COPY } from '@/src/features/settings/settingsCopy';
import { GroupTitle, SettingsGroup, SettingsSwitch } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { AlertReadinessNotice, alertReadiness } from '@/src/features/wishlist/WishlistNotices';
import { fontWeight, PINNED_MAX_FONT_SCALE, radius, spacing, useTheme } from '@/src/theme';

/**
 * Settings › Notifications (stage R13, mockup v50 screen 51; web: `/settings/notifications`):
 * the channels (In the app, Push, Email), wishlist alerts (with the line saying they need a place),
 * "What to notify me about" as a grid of topics by channel, a channel's column dimmed while it is
 * off, and quiet hours (24-hour times, the time zone); one "Save preferences", "No changes yet"
 * until something changed. Offers and trades left the phone (ADR 0018): their stored values go
 * back unchanged.
 */
export default function NotificationSettingsScreen() {
  const settings = useNotificationSettings();
  if (settings.data) {
    return <NotificationForm initial={settings.data} />;
  }
  return (
    <SettingsPage title={COPY.title} testID="screen-settings-notifications">
      {settings.error ? (
        <ErrorState
          error={settings.error}
          title={COPY.loadError}
          onRetry={() => void settings.refetch()}
          testID="settings-notifications-error"
        />
      ) : (
        <View accessibilityLabel={COPY.loading} aria-busy>
          <SkeletonList rows={6} rowHeight={56} testID="settings-notifications-loading" />
        </View>
      )}
    </SettingsPage>
  );
}

function NotificationForm({ initial }: { initial: NotificationSettingsResponse }) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const save = useSaveNotificationSettings();
  // Wishlist alerts need a country and state (ADR 0017): without them, say so next to the switch.
  const location = useMyLocation();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const quietError = quietHoursError(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const patch = (
    change: (settings: NotificationSettingsResponse) => NotificationSettingsResponse
  ) => setDraft((current) => change(current));
  const setMaster = (key: MasterKey, value: boolean) => patch((s) => ({ ...s, [key]: value }));
  const setCategory = (category: string, channel: Channel, value: boolean) =>
    patch((s) => {
      const current = s.categories[category] ?? { inApp: false, push: false, email: false };
      return {
        ...s,
        categories: { ...s.categories, [category]: { ...current, [channel]: value } },
      };
    });
  const setQuiet = (field: 'enabled' | 'start' | 'end' | 'timezone', value: string | boolean) =>
    patch((s) => ({ ...s, quietHours: { ...s.quietHours, [field]: value } }));

  const submit = async () => {
    if (quietError) {
      return;
    }
    setError(null);
    try {
      const answer = await save.mutateAsync(draft);
      setSaved(answer);
      setDraft(answer);
      snackbar.show(COPY.saved, { icon: 'success' });
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  return (
    <SettingsPage
      title={COPY.title}
      testID="screen-settings-notifications"
      footer={
        <PillButton
          label={dirty ? COPY.save : COPY.noChanges}
          loading={save.isPending}
          loadingLabel={COPY.saving}
          disabled={!dirty || quietError !== null}
          onPress={() => void submit()}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="notif-save"
        />
      }
    >
      <SettingsGroup title={COPY.channels} footnote={`${COPY.channelsNote} ${COPY.pushNote}`}>
        {CHANNELS.map((channel) => (
          <SettingsSwitch
            key={channel.key}
            icon={channel.icon}
            label={channel.label}
            value={draft[channel.master]}
            onChange={(value) => setMaster(channel.master, value)}
            testID={`notif-master-${channel.key}`}
          />
        ))}
      </SettingsGroup>

      <View style={styles.block}>
        <SettingsGroup title={COPY.wishlist}>
          <SettingsSwitch
            icon="heart-outline"
            label={COPY.wishlist}
            help={COPY.wishlistLine}
            value={draft.wishlistAlerts}
            onChange={(value) => patch((s) => ({ ...s, wishlistAlerts: value }))}
            testID="notif-wishlist-alerts"
          />
        </SettingsGroup>
        <AlertReadinessNotice readiness={alertReadiness(location.data)} />
      </View>

      <TopicGrid
        settings={draft}
        onChange={(category, channel, value) => setCategory(category, channel, value)}
      />

      <View style={styles.block}>
        <GroupTitle>{COPY.quiet}</GroupTitle>
        <View
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <SettingsSwitch
            icon="weather-night"
            label={COPY.quietSwitch}
            help={COPY.quietLine}
            value={draft.quietHours.enabled}
            onChange={(value) => setQuiet('enabled', value)}
            testID="notif-quiet"
          />
          {draft.quietHours.enabled ? (
            <View style={[styles.times, { borderTopColor: palette.border }]}>
              <TextField
                label={COPY.from}
                value={draft.quietHours.start}
                onChangeText={(value) => setQuiet('start', value)}
                placeholder="22:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                containerStyle={styles.grow}
                testID="notif-quiet-start"
              />
              <TextField
                label={COPY.until}
                value={draft.quietHours.end}
                onChangeText={(value) => setQuiet('end', value)}
                placeholder="08:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                containerStyle={styles.grow}
                testID="notif-quiet-end"
              />
            </View>
          ) : null}
        </View>
        <Text style={[styles.footnote, { color: palette.textMuted }]} testID="notif-time-zone">
          {COPY.timeZone(draft.quietHours.timezone)}
        </Text>
        {draft.quietHours.enabled && draft.quietHours.timezone !== deviceTimeZone() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.useDeviceZone}
            onPress={() => setQuiet('timezone', deviceTimeZone())}
            hitSlop={8}
            testID="notif-device-zone"
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={[styles.linkText, { color: palette.accent }]}>{COPY.useDeviceZone}</Text>
          </Pressable>
        ) : null}
        {quietError ? <FormMessage testID="notif-quiet-error">{quietError}</FormMessage> : null}
      </View>

      {error ? <FormMessage testID="notif-error">{error}</FormMessage> : null}
    </SettingsPage>
  );
}

/**
 * "What to notify me about" (mockup v50 screen 51): a topic per row, a checkbox per channel. While
 * a channel is off its column is dimmed and its boxes show empty and cannot change; what was
 * chosen comes back with the channel.
 */
function TopicGrid({
  settings,
  onChange,
}: {
  settings: NotificationSettingsResponse;
  onChange: (category: string, channel: Channel, value: boolean) => void;
}) {
  const { palette } = useTheme();
  const topics = categoriesOf(settings);
  return (
    <View style={styles.block} testID="notif-grid">
      <GroupTitle>{COPY.topics}</GroupTitle>
      <View
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <View
          style={styles.gridRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.topic} />
          {CHANNELS.map((channel) => (
            <Text
              key={channel.key}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[
                styles.column,
                { color: palette.textMuted },
                !settings[channel.master] && styles.dimmed,
              ]}
            >
              {channel.column}
            </Text>
          ))}
        </View>
        {topics.map((topic) => (
          <View
            key={topic.key}
            style={[styles.gridRow, styles.topicRow, { borderTopColor: palette.border }]}
          >
            <Text style={[styles.topic, styles.topicText, { color: palette.ink }]}>
              {topic.label}
            </Text>
            {CHANNELS.map((channel) => {
              const live = settings[channel.master];
              const checked = (settings.categories[topic.key]?.[channel.key] ?? false) && live;
              return (
                <Pressable
                  key={channel.key}
                  accessibilityRole="checkbox"
                  accessibilityLabel={cellLabel(topic.label, channel, live)}
                  aria-checked={checked}
                  aria-disabled={!live}
                  disabled={!live}
                  onPress={() => onChange(topic.key, channel.key, !checked)}
                  testID={`notif-${topic.key}-${channel.key}`}
                  style={({ pressed }) => [
                    styles.cell,
                    !live && styles.dimmed,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.box,
                      {
                        borderColor: checked ? palette.primary : palette.textDisabled,
                        backgroundColor: checked ? palette.primary : 'transparent',
                      },
                    ]}
                  >
                    {checked ? (
                      <MaterialCommunityIcons name="check" size={15} color={palette.onPrimary} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const CELL = 52;

const styles = StyleSheet.create({
  block: { gap: 6 },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  gridRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  topicRow: { borderTopWidth: 1, minHeight: 52 },
  topic: { flex: 1, minWidth: 0, paddingVertical: spacing[2] },
  topicText: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium },
  column: {
    width: CELL,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    paddingTop: 10,
    paddingBottom: 4,
  },
  cell: { width: CELL, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.35 },
  times: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: 14,
    paddingTop: spacing[2],
    paddingBottom: 14,
    borderTopWidth: 1,
  },
  grow: { flex: 1 },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
  link: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  linkText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
