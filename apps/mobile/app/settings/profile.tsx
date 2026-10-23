import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useGames, useMyProfile } from '@/src/api/hooks/profile';
import type { MyProfileResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { gameOptions } from '@/src/features/games/browsingGame';
import { useLeaveGuard } from '@/src/features/inventory/import/useLeaveGuard';
import { GameTiles } from '@/src/features/onboarding/GameTiles';
import { HandleField } from '@/src/features/onboarding/HandleField';
import { ToggleChips } from '@/src/features/onboarding/ToggleChips';
import { WELCOME_LANGUAGES } from '@/src/features/onboarding/welcomeCopy';
import { WelcomeTags } from '@/src/features/onboarding/WelcomeTags';
import { AvatarEditor } from '@/src/features/profile/AvatarEditor';
import { profileTagChips, type KnownTags } from '@/src/features/profile/profileTags';
import { useProfileEditor } from '@/src/features/profile/useProfileEditor';
import { EDIT_PROFILE_COPY as COPY, SETTINGS_COPY } from '@/src/features/settings/settingsCopy';
import { GroupTitle } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { BIO_MAX, DISPLAY_NAME_MAX, MAX_PROFILE_TAGS } from '@/src/lib/profile';
import { fontWeight, PINNED_MAX_FONT_SCALE, radius, spacing, useTheme } from '@/src/theme';

/**
 * Edit profile (stage R13, mockup v50 screen 48; the Profile tab's "Edit profile" and Settings'
 * profile card open it): the picture (saved at once), the handle with its live check, the display
 * name, the bio, the games (the welcome's tiles), the languages and the tags (12 at most, "Add a
 * tag"), all saved by one "Save changes" (`PUT /me/profile` with the tags, all or nothing), which
 * reads "No changes yet" until something changed. "Preview" opens the public profile; leaving
 * with unsaved changes asks first.
 */
export default function EditProfileScreen() {
  const profile = useMyProfile();
  if (profile.data) {
    return <EditProfileForm key={profile.data.id} profile={profile.data} />;
  }
  return (
    <SettingsPage title={COPY.title} testID="screen-settings-profile">
      {profile.error ? (
        <ErrorState
          error={profile.error}
          title={COPY.loadError}
          onRetry={() => void profile.refetch()}
          testID="settings-profile-error"
        />
      ) : (
        <View accessibilityLabel={COPY.loading} aria-busy>
          <SkeletonList rows={5} rowHeight={56} testID="settings-profile-loading" />
        </View>
      )}
    </SettingsPage>
  );
}

function EditProfileForm({ profile }: { profile: MyProfileResponse }) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const editor = useProfileEditor(profile);
  const games = useGames();
  const options = useMemo(() => (games.data ? gameOptions(games.data) : null), [games.data]);
  const [known, setKnown] = useState<KnownTags>(() => ({
    tags: editor.tags,
    custom: editor.customTags,
  }));
  const [addingTags, setAddingTags] = useState(false);
  const busy = editor.saving !== null;
  const guard = useLeaveGuard(editor.dirty && !busy);

  const languageChips = [
    ...WELCOME_LANGUAGES,
    ...editor.languages
      .filter((code) => !WELCOME_LANGUAGES.some((language) => language.code === code))
      .map((code) => ({ code, name: code })),
  ].map((language) => ({
    key: language.code,
    label: language.name,
    selected: editor.languages.includes(language.code),
    testID: `language-${language.code}`,
  }));
  const tagChips = profileTagChips(known, editor);

  const toggleTag = (key: string) => {
    if (key.startsWith('custom:')) {
      const label = key.slice('custom:'.length);
      editor.setCustomTags(
        editor.customTags.includes(label)
          ? editor.customTags.filter((value) => value !== label)
          : [...editor.customTags, label]
      );
      return;
    }
    const id = key.slice('tag:'.length);
    const tag = [...known.tags, ...editor.tags].find((entry) => entry.id === id);
    if (!tag) {
      return;
    }
    editor.setTags(
      editor.tags.some((entry) => entry.id === id)
        ? editor.tags.filter((entry) => entry.id !== id)
        : [...editor.tags, tag]
    );
  };

  const closeTags = () => {
    setAddingTags(false);
    setKnown((before) => ({
      tags: [
        ...before.tags,
        ...editor.tags.filter((tag) => !before.tags.some((t) => t.id === tag.id)),
      ],
      custom: [
        ...before.custom,
        ...editor.customTags.filter((label) => !before.custom.includes(label)),
      ],
    }));
  };

  const save = async () => {
    if (await editor.save()) {
      snackbar.show(COPY.saved, { icon: 'success' });
    }
  };

  const preview = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={COPY.previewLabel}
      onPress={() => router.push({ pathname: '/collectors/[id]', params: { id: profile.handle } })}
      hitSlop={8}
      accessibilityShowsLargeContentViewer
      accessibilityLargeContentTitle={COPY.preview}
      testID="profile-preview"
      style={({ pressed }) => [styles.preview, pressed && styles.pressed]}
    >
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        numberOfLines={1}
        style={[styles.previewText, { color: palette.accent }]}
      >
        {COPY.preview}
      </Text>
    </Pressable>
  );

  return (
    <SettingsPage
      title={COPY.title}
      right={preview}
      testID="screen-settings-profile"
      footer={
        <PillButton
          label={editor.dirty ? COPY.save : COPY.noChanges}
          loading={editor.saving === 'all'}
          loadingLabel={COPY.saving}
          disabled={!editor.dirty}
          onPress={() => void save()}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="profile-save"
        />
      }
    >
      <AvatarEditor avatarUrl={profile.avatarUrl} name={profile.displayName} disabled={busy} />
      <HandleField
        value={editor.draft.handle}
        onChange={(handle) => editor.setDraft({ ...editor.draft, handle })}
        error={editor.errors?.handle}
        hint={COPY.handleHint}
        disabled={busy}
      />
      <TextField
        label={COPY.displayName}
        value={editor.draft.displayName}
        onChangeText={(displayName) => editor.setDraft({ ...editor.draft, displayName })}
        error={editor.errors?.displayName}
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX}
        editable={!busy}
        testID="profile-display-name"
      />
      <TextField
        label={COPY.bio}
        labelAside={COPY.bioCount(editor.draft.bio.length, BIO_MAX)}
        value={editor.draft.bio}
        onChangeText={(bio) => editor.setDraft({ ...editor.draft, bio })}
        error={editor.errors?.bio}
        multiline
        numberOfLines={3}
        maxLength={BIO_MAX}
        editable={!busy}
        inputStyle={styles.bio}
        testID="profile-bio"
      />

      <View style={styles.block}>
        <GroupTitle>{COPY.games}</GroupTitle>
        <GameTiles
          games={options}
          loading={games.isPending}
          error={games.error}
          onRetry={() => void games.refetch()}
          value={editor.games}
          onChange={editor.setGames}
          opensFirst={null}
          disabled={busy}
        />
      </View>

      <View style={styles.block}>
        <GroupTitle>{COPY.languages}</GroupTitle>
        <ToggleChips
          label={COPY.languages}
          chips={languageChips}
          onToggle={(code) =>
            editor.setLanguages(
              editor.languages.includes(code)
                ? editor.languages.filter((value) => value !== code)
                : [...editor.languages, code]
            )
          }
          disabled={busy}
        />
      </View>

      <View style={styles.block}>
        <View style={styles.tagsHead}>
          <GroupTitle>{COPY.tags}</GroupTitle>
          <Text style={[styles.limit, { color: palette.settings.chevron }]}>
            {COPY.tagsLimit(MAX_PROFILE_TAGS)}
          </Text>
        </View>
        <ToggleChips
          label={COPY.tags}
          chips={tagChips}
          onToggle={toggleTag}
          disabled={busy}
          testID="profile-tags"
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.addTag}
              disabled={busy}
              onPress={() => setAddingTags(true)}
              hitSlop={4}
              testID="profile-add-tag"
              style={({ pressed }) => [
                styles.addTag,
                { borderColor: palette.textDisabled },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons name="plus" size={16} color={palette.accent} />
              <Text style={[styles.addTagText, { color: palette.accent }]}>{COPY.addTag}</Text>
            </Pressable>
          }
        />
      </View>

      {editor.formError && !busy ? (
        <FormMessage testID="profile-error">{editor.formError}</FormMessage>
      ) : null}

      <BottomSheet
        visible={addingTags}
        onClose={closeTags}
        title={COPY.addTagTitle}
        avoidKeyboard
        testID="profile-tag-sheet"
      >
        <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
          <WelcomeTags
            selected={editor.tags}
            onSelectedChange={editor.setTags}
            customLabels={editor.customTags}
            onCustomLabelsChange={editor.setCustomTags}
            disabled={busy}
          />
        </ScrollView>
        <PillButton
          label={COPY.done}
          variant="outline"
          onPress={closeTags}
          testID="profile-tag-sheet-done"
        />
      </BottomSheet>

      <ConfirmSheet
        visible={guard.asking}
        title={COPY.leaveTitle}
        message={COPY.leaveBody}
        confirmLabel={SETTINGS_COPY.leave}
        cancelLabel={SETTINGS_COPY.keepEditing}
        onConfirm={guard.leave}
        onCancel={guard.stay}
        testID="profile-leave-sheet"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  preview: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  previewText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  bio: { minHeight: 88, textAlignVertical: 'top' },
  block: { gap: spacing[2] },
  tagsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  limit: { fontSize: 12, lineHeight: 16 },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addTagText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  sheetScroll: { flexGrow: 0, maxHeight: 420 },
  pressed: { opacity: 0.7 },
});
