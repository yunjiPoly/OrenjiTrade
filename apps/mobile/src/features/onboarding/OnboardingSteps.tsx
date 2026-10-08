import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { AgeConfirmationCheckbox } from '@/src/features/legal/AgeConfirmationCheckbox';
import { LocationFields } from '@/src/features/location/LocationFields';
import type { LocationDraft } from '@/src/features/location/locationDraft';
import { GamePicker, LanguagePicker } from '@/src/features/profile/Pickers';
import { ProfileFields } from '@/src/features/profile/ProfileFields';
import { TagPicker } from '@/src/features/profile/TagPicker';
import type { ProfileEditor } from '@/src/features/profile/useProfileEditor';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

function StepHeading({ title, text }: { title: string; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.heading}>
      <Text
        accessibilityRole="header"
        style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}
      >
        {title}
      </Text>
      <Text style={[textStyle('md'), { color: palette.textMuted }]}>{text}</Text>
    </View>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Text accessibilityRole="header" style={[textStyle('md'), styles.sub, { color: palette.ink }]}>
      {children}
    </Text>
  );
}

export interface AgeStepProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Show the validation message (after a submit attempt). */
  showError: boolean;
  /** The published attestation: loading, failed (retry), or ready. */
  documents: 'loading' | 'error' | 'ready';
  documentsError?: unknown;
  onRetryDocuments: () => void;
  busy: boolean;
  /** Recorded already (an answer is in flight or the step was just completed). */
  done: boolean;
  error: string | null;
  onContinue: () => void;
  onSignOut: () => void;
}

/**
 * The first step of an account that never confirmed being 18 years of age or older (existing
 * collectors on their next sign-in, Google sign-ups that passed the consent screen before the
 * rule): the statement, the bilingual checkbox, Continue; never editable afterwards. Sign out
 * stays available so a collector who cannot confirm is never stuck.
 */
export function AgeStep({
  checked,
  onChange,
  showError,
  documents,
  documentsError,
  onRetryDocuments,
  busy,
  done,
  error,
  onContinue,
  onSignOut,
}: AgeStepProps) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <View style={styles.step} testID="onboarding-age">
      <StepHeading
        title="Are you 18 or older?"
        text="OrenjiTrade is for adults. You must be 18 years of age or older to be shown on the map, message collectors, post in the community or make offers."
      />
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        We record only your confirmation and its date; no identity document is requested. Accounts
        found to belong to minors are closed (see the{' '}
        <Text
          accessibilityRole="link"
          style={[styles.link, { color: palette.accent }]}
          onPress={() => router.push({ pathname: '/legal/[key]', params: { key: 'terms' } })}
          testID="onboarding-age-terms"
        >
          Terms of Service
        </Text>
        ).
      </Text>
      {documents === 'loading' ? (
        <View accessibilityLabel="Loading the confirmation" testID="onboarding-age-loading">
          <SkeletonList rows={1} rowHeight={56} />
        </View>
      ) : documents === 'error' ? (
        <ErrorState
          compact
          testID="onboarding-age-error"
          error={documentsError}
          title="We could not load the confirmation"
          onRetry={onRetryDocuments}
        />
      ) : (
        <AgeConfirmationCheckbox
          checked={checked}
          onChange={onChange}
          showError={showError}
          disabled={busy || done}
        />
      )}
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button
        label="Continue"
        loading={busy}
        disabled={done || documents !== 'ready'}
        onPress={onContinue}
        testID="onboarding-age-continue"
      />
      <Button
        label="Sign out"
        variant="ghost"
        disabled={busy}
        onPress={onSignOut}
        testID="onboarding-sign-out"
      />
    </View>
  );
}

export interface ProfileStepProps {
  editor: ProfileEditor;
  busy: boolean;
  onContinue: () => void;
}

/** Step 1: who are you (handle, display name, bio). */
export function ProfileStep({ editor, busy, onContinue }: ProfileStepProps) {
  return (
    <View style={styles.step} testID="onboarding-profile">
      <StepHeading
        title="Who are you?"
        text="Your handle is your public address; your display name is what collectors see."
      />
      <ProfileFields
        value={editor.draft}
        onChange={editor.setDraft}
        errors={editor.errors}
        disabled={busy}
      />
      {editor.formError ? <FormMessage>{editor.formError}</FormMessage> : null}
      <Button
        label="Continue"
        loading={busy}
        onPress={onContinue}
        testID="onboarding-profile-continue"
      />
    </View>
  );
}

export interface InterestsStepProps {
  editor: ProfileEditor;
  busy: boolean;
  showMissing: boolean;
  onBack: () => void;
  onContinue: () => void;
}

/** Step 2: games, languages and tags (at least one game or tag). */
export function InterestsStep({
  editor,
  busy,
  showMissing,
  onBack,
  onContinue,
}: InterestsStepProps) {
  return (
    <View style={styles.step} testID="onboarding-interests">
      <StepHeading
        title="What do you collect?"
        text="Pick your games and a few tags. They appear on your profile and help matching."
      />
      <GamePicker value={editor.games} onChange={editor.setGames} disabled={busy} />
      <SubHeading>Languages</SubHeading>
      <LanguagePicker value={editor.languages} onChange={editor.setLanguages} disabled={busy} />
      <SubHeading>Tags</SubHeading>
      <TagPicker
        selected={editor.tags}
        onSelectedChange={editor.setTags}
        customLabels={editor.customTags}
        onCustomLabelsChange={editor.setCustomTags}
        disabled={busy}
      />
      {showMissing && !editor.hasInterests ? (
        <FormMessage testID="interests-missing">Choose at least one game or one tag.</FormMessage>
      ) : null}
      {editor.formError ? <FormMessage>{editor.formError}</FormMessage> : null}
      <View style={styles.actions}>
        <Button label="Back" variant="ghost" onPress={onBack} disabled={busy} />
        <Button
          label="Continue"
          loading={busy}
          onPress={onContinue}
          style={styles.grow}
          testID="onboarding-interests-continue"
        />
      </View>
    </View>
  );
}

export interface LocationStepProps {
  value: LocationDraft;
  onChange: (draft: LocationDraft) => void;
  showErrors: boolean;
  discoverable: boolean;
  onDiscoverableChange: (value: boolean) => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

/** Step 3: "Where are you?" (country, state or province, optional city) and the map opt-in. */
export function LocationStep({
  value,
  onChange,
  showErrors,
  discoverable,
  onDiscoverableChange,
  busy,
  error,
  onBack,
  onSkip,
  onFinish,
}: LocationStepProps) {
  return (
    <View style={styles.step} testID="onboarding-location">
      <StepHeading
        title="Where are you?"
        text="Pick your country and your state or province: they set your region and where your binders appear. Others only ever see your state or province; your city is optional and shown only on your profile."
      />
      <LocationFields value={value} onChange={onChange} showErrors={showErrors} disabled={busy} />
      <SwitchRow
        label="Show me on the map"
        help="When on, collectors of your region see your state or province and can find your public binders. Off by default; change it anytime in Settings → Location."
        value={discoverable}
        onChange={onDiscoverableChange}
        disabled={busy}
        testID="onboarding-discoverable"
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <View style={styles.actions}>
        <Button label="Back" variant="ghost" onPress={onBack} disabled={busy} />
        <Button
          label="Skip for now"
          variant="secondary"
          onPress={onSkip}
          disabled={busy}
          testID="onboarding-skip"
        />
      </View>
      <Button label="Finish" loading={busy} onPress={onFinish} testID="onboarding-finish" />
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing[4] },
  heading: { gap: spacing[1] },
  title: { fontWeight: fontWeight.semibold },
  sub: { fontWeight: fontWeight.semibold, marginTop: spacing[2] },
  actions: { flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  grow: { flex: 1 },
  link: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
});
