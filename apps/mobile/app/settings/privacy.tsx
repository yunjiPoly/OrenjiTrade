import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { usePrivacySettings, useSavePrivacy } from '@/src/api/hooks/location';
import type { PrivacySettings } from '@/src/api/types';
import { Divider, SectionCard } from '@/src/components/ui/Layout';
import { RadioGroup, SwitchRow } from '@/src/components/ui/FormControls';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import {
  MESSAGING_OPTIONS,
  PRIVACY_TOGGLES,
  PROFILE_VISIBILITY_OPTIONS,
} from '@/src/features/settings/privacyOptions';
import { spacing, textStyle, useTheme } from '@/src/theme';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Settings → Privacy (web: `/settings/privacy`). Every change is saved at once; the endpoint
 * replaces the whole document, so saves run in order and a failure restores the last saved state.
 */
export default function PrivacySettingsScreen() {
  const privacy = usePrivacySettings();
  return (
    <Screen scroll safeBottom testID="screen-settings-privacy">
      <QueryState
        query={privacy}
        errorTitle="We could not load your privacy settings"
        loading={<SkeletonList rows={5} rowHeight={56} />}
        testID="settings-privacy"
      >
        {(data) => <PrivacyForm initial={data} />}
      </QueryState>
    </Screen>
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
        snackbar.show(messageOf(caught, 'Your change could not be saved.'), { tone: 'error' });
      }
    });
  };

  const status =
    saveState === 'saving'
      ? { icon: 'sync' as const, text: 'Saving…' }
      : saveState === 'saved'
        ? { icon: 'cloud-check-outline' as const, text: 'All changes saved' }
        : saveState === 'error'
          ? { icon: 'alert-circle-outline' as const, text: 'Last change not saved' }
          : null;

  return (
    <View style={styles.root}>
      <SectionCard title="Visibility" description="Changes are saved as soon as you make them.">
        <View style={styles.status} accessibilityLiveRegion="polite" testID="privacy-status">
          {status ? (
            <>
              <MaterialCommunityIcons name={status.icon} size={16} color={palette.textMuted} />
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{status.text}</Text>
            </>
          ) : null}
        </View>
        {PRIVACY_TOGGLES.map((toggle, index) => (
          <View key={toggle.key}>
            {index > 0 ? <Divider /> : null}
            <SwitchRow
              label={toggle.label}
              help={toggle.help}
              value={draft[toggle.key]}
              onChange={(value) => update({ [toggle.key]: value })}
              testID={`privacy-toggle-${toggle.key}`}
            />
          </View>
        ))}
      </SectionCard>

      <SectionCard
        title="Who can see your profile"
        description="Private profiles are hidden from everyone except you."
      >
        <RadioGroup
          label="Who can see your profile"
          options={PROFILE_VISIBILITY_OPTIONS}
          value={draft.profileVisibility}
          onChange={(profileVisibility) => update({ profileVisibility })}
          testID="privacy-visibility"
        />
      </SectionCard>

      <SectionCard
        title="Who can message you"
        description="Blocked collectors can never message you."
      >
        <RadioGroup
          label="Who can message you"
          options={MESSAGING_OPTIONS}
          value={draft.messagingPermission}
          onChange={(messagingPermission) => update({ messagingPermission })}
          testID="privacy-messaging"
        />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], minHeight: 20 },
});
