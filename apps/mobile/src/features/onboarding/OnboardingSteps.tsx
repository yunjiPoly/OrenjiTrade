import { StyleSheet, View } from 'react-native';

import { useRegions } from '@/src/api/hooks/regions';
import { FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import type { GameOption } from '@/src/features/games/browsingGame';
import { LocationFields } from '@/src/features/location/LocationFields';
import { countryOf, type LocationDraft } from '@/src/features/location/locationDraft';
import type { ProfileEditor } from '@/src/features/profile/useProfileEditor';
import { BIO_MAX, DISPLAY_NAME_MAX } from '@/src/lib/profile';
import { fontFamily, fontWeight, spacing, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { GameTiles } from './GameTiles';
import { HandleField } from './HandleField';
import { ToggleChips } from './ToggleChips';
import { WELCOME_COPY, WELCOME_LANGUAGES } from './welcomeCopy';
import { WelcomeTags } from './WelcomeTags';

/** The title and the line under it, at the top of a step's scrolling part. */
export function StepHeading({ title, text }: { title: string; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.heading}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
        style={[styles.title, { color: palette.ink }]}
      >
        {title}
      </Text>
      <Text style={[styles.intro, { color: palette.textMuted }]}>{text}</Text>
    </View>
  );
}

/** A section's small uppercase title ("GAMES", "LANGUAGES YOU TRADE IN"). */
function SectionTitle({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: palette.textMuted }]}>
      {children.toUpperCase()}
    </Text>
  );
}

export interface ProfileStepProps {
  editor: ProfileEditor;
  busy: boolean;
}

/** 40 "Who are you?": the handle with its live check, the display name and the bio. */
export function ProfileStep({ editor, busy }: ProfileStepProps) {
  const { draft, setDraft, errors } = editor;
  return (
    <View style={styles.step} testID="onboarding-profile">
      <StepHeading title={WELCOME_COPY.profile.title} text={WELCOME_COPY.profile.intro} />
      <HandleField
        value={draft.handle}
        onChange={(handle) => setDraft({ ...draft, handle })}
        error={errors?.handle}
        disabled={busy}
      />
      <TextField
        label={WELCOME_COPY.profile.displayName}
        value={draft.displayName}
        onChangeText={(displayName) => setDraft({ ...draft, displayName })}
        error={errors?.displayName}
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX}
        editable={!busy}
        testID="profile-display-name"
      />
      <TextField
        label={WELCOME_COPY.profile.bio}
        labelAside={WELCOME_COPY.profile.bioCount(draft.bio.length, BIO_MAX)}
        value={draft.bio}
        onChangeText={(bio) => setDraft({ ...draft, bio })}
        error={errors?.bio}
        placeholder={WELCOME_COPY.profile.bioPlaceholder}
        multiline
        numberOfLines={3}
        maxLength={BIO_MAX}
        editable={!busy}
        inputStyle={styles.bio}
        testID="profile-bio"
      />
      {editor.formError ? <FormMessage>{editor.formError}</FormMessage> : null}
    </View>
  );
}

export interface GamesStepProps {
  editor: ProfileEditor;
  busy: boolean;
  games: readonly GameOption[] | null;
  gamesLoading: boolean;
  gamesError: unknown;
  onRetryGames: () => void;
  opensFirst: string | null;
}

/** 41 "What do you collect?": the game tiles, the languages and the tags. */
export function GamesStep({
  editor,
  busy,
  games,
  gamesLoading,
  gamesError,
  onRetryGames,
  opensFirst,
}: GamesStepProps) {
  return (
    <View style={styles.step} testID="onboarding-interests">
      <StepHeading title={WELCOME_COPY.games.title} text={WELCOME_COPY.games.intro} />
      <View style={styles.block}>
        <SectionTitle>{WELCOME_COPY.games.gamesHeading}</SectionTitle>
        <GameTiles
          games={games}
          loading={gamesLoading}
          error={gamesError}
          onRetry={onRetryGames}
          value={editor.games}
          onChange={editor.setGames}
          opensFirst={opensFirst}
          disabled={busy}
        />
      </View>
      <View style={styles.block}>
        <SectionTitle>{WELCOME_COPY.games.languagesHeading}</SectionTitle>
        <ToggleChips
          label={WELCOME_COPY.games.languagesHeading}
          chips={WELCOME_LANGUAGES.map((language) => ({
            key: language.code,
            label: language.name,
            selected: editor.languages.includes(language.code),
            testID: `language-${language.code}`,
          }))}
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
        <SectionTitle>{WELCOME_COPY.games.tagsHeading}</SectionTitle>
        <WelcomeTags
          selected={editor.tags}
          onSelectedChange={editor.setTags}
          customLabels={editor.customTags}
          onCustomLabelsChange={editor.setCustomTags}
          disabled={busy}
        />
      </View>
      {editor.formError ? <FormMessage>{editor.formError}</FormMessage> : null}
    </View>
  );
}

/**
 * The line of "Show me on the map": who finds the collector's binders and where (the browsed
 * place's names once chosen), off until turned on.
 */
export function discoverableHelp(regionName: string | null, provinceName: string | null): string {
  return WELCOME_COPY.place.discoverableHelp(
    regionName ?? WELCOME_COPY.place.yourRegion,
    provinceName ?? WELCOME_COPY.place.yourProvince
  );
}

export interface PlaceStepProps {
  value: LocationDraft;
  onChange: (draft: LocationDraft) => void;
  showErrors: boolean;
  discoverable: boolean;
  onDiscoverableChange: (value: boolean) => void;
  busy: boolean;
  error: string | null;
}

/**
 * 42 "Where do you ship from?": region, country and state or province, the optional city, "Show
 * my city on my profile" and "Show me on the map" (off by default). No map, no GPS (ADR 0017).
 */
export function PlaceStep({
  value,
  onChange,
  showErrors,
  discoverable,
  onDiscoverableChange,
  busy,
  error,
}: PlaceStepProps) {
  const regions = useRegions();
  const all = regions.data?.regions ?? [];
  const regionName = all.find((region) => region.code === value.regionCode)?.name ?? null;
  const country = countryOf(all, value.countryCode);
  const provinceName =
    country?.subdivisions.find((subdivision) => subdivision.code === value.subdivisionCode)?.name ??
    null;
  return (
    <View style={styles.step} testID="onboarding-location">
      <StepHeading title={WELCOME_COPY.place.title} text={WELCOME_COPY.place.intro} />
      <LocationFields
        value={value}
        onChange={onChange}
        showErrors={showErrors}
        disabled={busy}
        variant="welcome"
        extraSwitch={
          <SwitchRow
            label={WELCOME_COPY.place.discoverable}
            help={discoverableHelp(regionName, provinceName)}
            value={discoverable}
            onChange={onDiscoverableChange}
            disabled={busy}
            testID="onboarding-discoverable"
          />
        }
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing[4] },
  heading: { gap: 6, paddingTop: 6, marginBottom: spacing[1] },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  intro: { fontSize: 14, lineHeight: 21 },
  block: { gap: spacing[2] },
  section: { fontSize: 12, fontWeight: fontWeight.semibold, letterSpacing: 0.6, marginBottom: 6 },
  bio: { minHeight: 88, textAlignVertical: 'top' },
});
