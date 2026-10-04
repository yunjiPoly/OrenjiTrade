import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMyProfile } from '@/src/api/hooks/profile';
import type { MyProfileResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { AvatarEditor } from '@/src/features/profile/AvatarEditor';
import { GamePicker, LanguagePicker } from '@/src/features/profile/Pickers';
import { ProfileFields } from '@/src/features/profile/ProfileFields';
import { TagPicker } from '@/src/features/profile/TagPicker';
import { useProfileEditor } from '@/src/features/profile/useProfileEditor';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/** Settings → Profile (web: `/settings/profile`): picture, public details, games, languages, tags. */
export default function ProfileSettingsScreen() {
  const profile = useMyProfile();
  return (
    <Screen scroll safeBottom testID="screen-settings-profile">
      <QueryState
        query={profile}
        errorTitle="We could not load your profile"
        loading={<SkeletonList rows={4} rowHeight={64} />}
        testID="settings-profile"
      >
        {(data) => <ProfileEditorForm profile={data} />}
      </QueryState>
    </Screen>
  );
}

function ProfileEditorForm({ profile }: { profile: MyProfileResponse }) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const editor = useProfileEditor(profile);

  const saveDetails = async () => {
    if (await editor.saveDetails()) {
      snackbar.show('Profile saved.');
    }
  };
  const saveTags = async () => {
    if (await editor.saveTags()) {
      snackbar.show('Tags saved.');
    }
  };

  return (
    <View style={styles.root}>
      <SectionCard
        title="Profile picture"
        description="Shown on your profile and on the map preview."
      >
        <AvatarEditor avatarUrl={profile.avatarUrl} name={profile.displayName} />
      </SectionCard>

      <SectionCard title="Public details" description="What collectors see on your profile.">
        <ProfileFields
          value={editor.draft}
          onChange={editor.setDraft}
          errors={editor.errors}
          disabled={editor.saving !== null}
        />
        <Text style={[textStyle('md'), styles.sub, { color: palette.ink }]}>Games</Text>
        <GamePicker
          value={editor.games}
          onChange={editor.setGames}
          disabled={editor.saving !== null}
        />
        <Text style={[textStyle('md'), styles.sub, { color: palette.ink }]}>Languages</Text>
        <LanguagePicker
          value={editor.languages}
          onChange={editor.setLanguages}
          disabled={editor.saving !== null}
        />
        {editor.formError && editor.saving === null ? (
          <FormMessage>{editor.formError}</FormMessage>
        ) : null}
        <Button
          label="Save details"
          loading={editor.saving === 'details'}
          disabled={!editor.detailsDirty || editor.saving !== null}
          onPress={() => void saveDetails()}
          testID="profile-save-details"
        />
        <Button
          label="View public profile"
          variant="ghost"
          icon="eye-outline"
          onPress={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: profile.handle } })
          }
        />
      </SectionCard>

      <SectionCard title="Tags" description="Up to 12 tags describing how you collect and trade.">
        <TagPicker
          selected={editor.tags}
          onSelectedChange={editor.setTags}
          customLabels={editor.customTags}
          onCustomLabelsChange={editor.setCustomTags}
          disabled={editor.saving !== null}
        />
        <Button
          label="Save tags"
          loading={editor.saving === 'tags'}
          disabled={!editor.tagsDirty || editor.saving !== null}
          onPress={() => void saveTags()}
          testID="profile-save-tags"
        />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  sub: { fontWeight: fontWeight.semibold },
});
