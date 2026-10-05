import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MyLocationResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { TradingAreaPicker } from '@/src/features/location/TradingAreaPicker';
import type { AreaDraft } from '@/src/features/location/tradingArea';
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

export interface AreaStepProps {
  area: AreaDraft;
  onAreaChange: (area: AreaDraft) => void;
  location: MyLocationResponse | undefined;
  discoverable: boolean;
  onDiscoverableChange: (value: boolean) => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

/** Step 3: trading area (manual or device, approximate only) and the map opt-in (off). */
export function AreaStep({
  area,
  onAreaChange,
  location,
  discoverable,
  onDiscoverableChange,
  busy,
  error,
  onBack,
  onSkip,
  onFinish,
}: AreaStepProps) {
  return (
    <View style={styles.step} testID="onboarding-area">
      <StepHeading
        title="Where do you trade?"
        text="Choose the area where you like to meet or ship from. Only an approximate area is ever shown to others."
      />
      <TradingAreaPicker value={area} onChange={onAreaChange} location={location} disabled={busy} />
      <SwitchRow
        label="Show me on the map"
        help="When on, collectors nearby see your approximate area and can find your public binders. Off by default; change it anytime in Settings → Location."
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
});
