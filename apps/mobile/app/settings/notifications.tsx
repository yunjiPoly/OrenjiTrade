import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from '@/src/api/hooks/notifications';
import type { NotificationSettingsResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { Checkbox, FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { Divider, SectionCard } from '@/src/components/ui/Layout';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { TextField } from '@/src/components/ui/TextField';
import {
  CHANNELS,
  categoriesOf,
  deviceTimeZone,
  quietHoursError,
  type Channel,
  type MasterKey,
} from '@/src/features/settings/notificationOptions';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/** Settings → Notifications (web: `/settings/notifications`): channels, topics, quiet hours. */
export default function NotificationSettingsScreen() {
  const settings = useNotificationSettings();
  return (
    <Screen scroll safeBottom testID="screen-settings-notifications">
      <QueryState
        query={settings}
        errorTitle="We could not load your notification preferences"
        loading={<SkeletonList rows={5} rowHeight={56} />}
        testID="settings-notifications"
      >
        {(data) => <NotificationForm initial={data} />}
      </QueryState>
    </Screen>
  );
}

function NotificationForm({ initial }: { initial: NotificationSettingsResponse }) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const save = useSaveNotificationSettings();
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quietError = quietHoursError(draft);

  const patch = (
    change: (settings: NotificationSettingsResponse) => NotificationSettingsResponse
  ) => {
    setDraft((current) => change(current));
    setDirty(true);
  };
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
      const saved = await save.mutateAsync(draft);
      setDraft(saved);
      setDirty(false);
      snackbar.show('Notification preferences saved.');
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  return (
    <View style={styles.root}>
      <SectionCard title="Channels" description="Turn a channel off to silence it everywhere.">
        {CHANNELS.map((channel, index) => (
          <View key={channel.key}>
            {index > 0 ? <Divider /> : null}
            <SwitchRow
              label={channel.label}
              value={draft[channel.master]}
              onChange={(value) => setMaster(channel.master, value)}
              testID={`notif-master-${channel.key}`}
            />
          </View>
        ))}
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          Push notifications on this device arrive with a later release; your choice is already
          saved.
        </Text>
      </SectionCard>

      <SectionCard title="What to notify me about" description="Choose per topic and channel.">
        {categoriesOf(draft).map((category, index) => (
          <View key={category.key} style={styles.category}>
            {index > 0 ? <Divider /> : null}
            <Text style={[textStyle('md'), styles.categoryLabel, { color: palette.ink }]}>
              {category.label}
            </Text>
            {category.help ? (
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{category.help}</Text>
            ) : null}
            <View style={styles.channels}>
              {CHANNELS.map((channel) => (
                <View key={channel.key} style={styles.channel}>
                  <Checkbox
                    label={`${category.label} by ${channel.label}`}
                    checked={draft.categories[category.key]?.[channel.key] ?? false}
                    disabled={!draft[channel.master]}
                    onChange={(value) => setCategory(category.key, channel.key, value)}
                    testID={`notif-${category.key}-${channel.key}`}
                  >
                    <Text style={[textStyle('sm'), { color: palette.ink }]}>{channel.label}</Text>
                  </Checkbox>
                </View>
              ))}
            </View>
          </View>
        ))}
      </SectionCard>

      <SectionCard
        title="Quiet hours"
        description="No push notifications during these hours. In-app notifications still arrive."
      >
        <SwitchRow
          label="Pause push notifications at night"
          value={draft.quietHours.enabled}
          onChange={(value) => setQuiet('enabled', value)}
          testID="notif-quiet"
        />
        {draft.quietHours.enabled ? (
          <View style={styles.quiet}>
            <View style={styles.times}>
              <TextField
                label="From"
                value={draft.quietHours.start}
                onChangeText={(value) => setQuiet('start', value)}
                placeholder="22:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                containerStyle={styles.grow}
                testID="notif-quiet-start"
              />
              <TextField
                label="Until"
                value={draft.quietHours.end}
                onChangeText={(value) => setQuiet('end', value)}
                placeholder="08:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                containerStyle={styles.grow}
                testID="notif-quiet-end"
              />
            </View>
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
              Time zone: {draft.quietHours.timezone}
            </Text>
            {draft.quietHours.timezone !== deviceTimeZone() ? (
              <Button
                label="Use this device's time zone"
                variant="ghost"
                onPress={() => setQuiet('timezone', deviceTimeZone())}
              />
            ) : null}
            {quietError ? <FormMessage testID="notif-quiet-error">{quietError}</FormMessage> : null}
          </View>
        ) : null}
      </SectionCard>

      {error ? (
        <FormMessage>{error}</FormMessage>
      ) : dirty ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          You have unsaved changes.
        </Text>
      ) : null}
      <Button
        label="Save preferences"
        loading={save.isPending}
        disabled={!dirty || quietError !== null}
        onPress={() => void submit()}
        testID="notif-save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  category: { gap: spacing[1] },
  categoryLabel: { fontWeight: fontWeight.medium, marginTop: spacing[2] },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  channel: { minWidth: 88 },
  quiet: { gap: spacing[3] },
  times: { flexDirection: 'row', gap: spacing[3] },
  grow: { flex: 1 },
});
