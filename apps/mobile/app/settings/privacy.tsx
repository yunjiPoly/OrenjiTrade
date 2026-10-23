import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { usePrivacySettings, useSavePrivacy } from '@/src/api/hooks/location';
import { useUid } from '@/src/api/hooks/useUid';
import type { PrivacySettings } from '@/src/api/types';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import {
  useRecentSearchesStore,
  useRemembersSearches,
} from '@/src/features/catalog/recentSearchesStore';
import {
  MESSAGING_OPTIONS,
  PRIVACY_COPY as COPY,
  PRIVACY_TOGGLES,
  PROFILE_VISIBILITY_OPTIONS,
  REMEMBER_SEARCHES,
} from '@/src/features/settings/privacyOptions';
import {
  SettingsGroup,
  SettingsRadios,
  SettingsSwitch,
} from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { fontWeight, useTheme } from '@/src/theme';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Settings › Privacy (stage R13, mockup v50 screen 52; web: `/settings/privacy`): Visibility (Show
 * me on the map, Appear in collector search, Let others see what you want, Show when I was last
 * active, Show when I am online), who can see your profile, who can message you, and "Remember my
 * searches" (this phone only). Every change is saved at once, "All changes saved" in the top bar;
 * the endpoint replaces the whole document, so saves run in order and a failure restores the last
 * saved state.
 */
export default function PrivacySettingsScreen() {
  const privacy = usePrivacySettings();
  if (privacy.data) {
    return <PrivacyForm initial={privacy.data} />;
  }
  return (
    <SettingsPage title={COPY.title} testID="screen-settings-privacy">
      {privacy.error ? (
        <ErrorState
          error={privacy.error}
          title={COPY.loadError}
          onRetry={() => void privacy.refetch()}
          testID="settings-privacy-error"
        />
      ) : (
        <View accessibilityLabel={COPY.loading} aria-busy>
          <SkeletonList rows={6} rowHeight={56} testID="settings-privacy-loading" />
        </View>
      )}
      <RememberSearches />
    </SettingsPage>
  );
}

/**
 * "Remember my searches" (owner spec 2026-10-14, sections 9, 12 and 16): on by default; off clears
 * the recent searches of this account on this phone and stops them until it is on again.
 */
function RememberSearches() {
  const uid = useUid();
  const remembering = useRemembersSearches(uid);
  const setRemembering = useRecentSearchesStore((state) => state.setRemembering);
  return (
    <SettingsGroup title={REMEMBER_SEARCHES.title}>
      <SettingsSwitch
        label={REMEMBER_SEARCHES.label}
        help={REMEMBER_SEARCHES.help}
        value={remembering}
        onChange={(on) => {
          if (uid) {
            setRemembering(uid, on);
          }
        }}
        disabled={!uid}
        testID="privacy-remember-searches"
      />
    </SettingsGroup>
  );
}

function PrivacyForm({ initial }: { initial: PrivacySettings }) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const save = useSavePrivacy();
  const [draft, setDraft] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const lastSaved = useRef(initial);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const sequence = useRef(0);
  // Rapid changes build on the latest draft, not on the one of the last render.
  const latest = useRef(initial);

  const update = (patch: Partial<PrivacySettings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    setSaveState('saving');
    const ticket = ++sequence.current;
    queue.current = queue.current.then(async () => {
      try {
        const saved = await save.mutateAsync(next);
        lastSaved.current = saved;
        if (ticket === sequence.current) {
          latest.current = saved;
          setDraft(saved);
          setSaveState('saved');
        }
      } catch (caught) {
        if (ticket === sequence.current) {
          latest.current = lastSaved.current;
          setDraft(lastSaved.current);
          setSaveState('error');
        }
        snackbar.show(messageOf(caught, COPY.failed), { tone: 'error' });
      }
    });
  };

  const status =
    saveState === 'saving' ? COPY.saving : saveState === 'error' ? COPY.notSaved : COPY.saved;
  const statusColor =
    saveState === 'error'
      ? palette.danger
      : saveState === 'saving'
        ? palette.textMuted
        : palette.accent;

  return (
    <SettingsPage
      title={COPY.title}
      testID="screen-settings-privacy"
      right={
        <View accessibilityRole="text" accessibilityLiveRegion="polite" testID="privacy-status">
          <Text numberOfLines={2} style={[styles.status, { color: statusColor }]}>
            {status}
          </Text>
        </View>
      }
    >
      <SettingsGroup title={COPY.visibility}>
        {PRIVACY_TOGGLES.map((toggle) => (
          <SettingsSwitch
            key={toggle.key}
            label={toggle.label}
            help={toggle.help}
            value={draft[toggle.key]}
            onChange={(value) => update({ [toggle.key]: value })}
            testID={`privacy-toggle-${toggle.key}`}
          />
        ))}
      </SettingsGroup>
      <SettingsRadios
        title={COPY.profile}
        options={PROFILE_VISIBILITY_OPTIONS}
        value={draft.profileVisibility}
        onChange={(profileVisibility) => update({ profileVisibility })}
        testID="privacy-visibility"
      />
      <SettingsRadios
        title={COPY.messaging}
        options={MESSAGING_OPTIONS}
        value={draft.messagingPermission}
        onChange={(messagingPermission) => update({ messagingPermission })}
        testID="privacy-messaging"
      />
      <RememberSearches />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.medium, textAlign: 'right' },
});
