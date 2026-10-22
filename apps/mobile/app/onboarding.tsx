import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import { usePendingLink } from '@/src/account/pendingLink';
import { messageOf } from '@/src/api/errorMessages';
import {
  useMyLocation,
  usePrivacySettings,
  useSaveLocation,
  useSavePrivacy,
} from '@/src/api/hooks/location';
import { useGames, useMyProfile } from '@/src/api/hooks/profile';
import { useUid } from '@/src/api/hooks/useUid';
import { useSession } from '@/src/auth/session';
import { PillButton } from '@/src/components/ui/PillButton';
import { QueryState } from '@/src/components/ui/QueryState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { gameOptions, pickBrowsingGame } from '@/src/features/games/browsingGame';
import {
  draftFromLocation,
  isLocationDirty,
  locationInput,
  missingField,
  type LocationDraft,
} from '@/src/features/location/locationDraft';
import { GamesStep, PlaceStep, ProfileStep } from '@/src/features/onboarding/OnboardingSteps';
import { WELCOME_COPY } from '@/src/features/onboarding/welcomeCopy';
import { WelcomeHeader } from '@/src/features/onboarding/WelcomeHeader';
import {
  WELCOME_STEPS,
  firstWelcomeStep,
  openingGame,
  previousWelcomeStep,
  welcomeStepNumber,
  type WelcomeStep,
} from '@/src/features/onboarding/welcomeSteps';
import { useProfileEditor } from '@/src/features/profile/useProfileEditor';
import { PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

/** The names Back says ("Back to Who are you?"). */
const STEP_NAMES: Record<WelcomeStep, string> = {
  profile: WELCOME_COPY.profile.name,
  games: WELCOME_COPY.games.name,
  place: WELCOME_COPY.place.name,
};

/**
 * The welcome after sign-up (stage R12, mockup v50 screens 40 to 42; web: `/onboarding`): three
 * steps, "Step {n} of 3" with a three-part bar. 40 "Who are you?" (handle with its live check,
 * display name, bio), 41 "What do you collect?" (the games, at least one, the first picked that
 * has cards opening Home and Search; the languages; the tags) and 42 "Where do you ship from?"
 * (region, country and state or province, the optional city, "Show my city on my profile" and
 * "Show me on the map", off by default; ADR 0017). The 18+ confirmation is no step of its own: sign-up
 * asks it, and an account without it is on Review our terms first. It resumes on the first step
 * the account has not done (`firstWelcomeStep`).
 */
export default function OnboardingScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useMyProfile();
  const location = useMyLocation();
  const privacy = usePrivacySettings();
  const account = useAccount();

  // One query state for the loads the screen needs. `/me` too: its onboarding flags pick the
  // first step, which is decided once when the flow mounts.
  const combined = {
    data:
      profile.data && location.data && privacy.data && account.me
        ? { profile: profile.data, location: location.data, privacy: privacy.data }
        : undefined,
    error: profile.error ?? location.error ?? privacy.error,
    isPending: profile.isPending || location.isPending || privacy.isPending || !account.me,
    isFetching: profile.isFetching || location.isFetching || privacy.isFetching,
    refetch: () => Promise.all([profile.refetch(), location.refetch(), privacy.refetch()]),
  };

  return (
    <View
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
      testID="screen-onboarding"
    >
      <Stack.Screen options={{ title: 'Welcome', headerShown: false, gestureEnabled: false }} />
      {combined.data ? null : <WelcomeHeader current={1} total={WELCOME_STEPS.length} />}
      <QueryState
        query={combined}
        errorTitle={WELCOME_COPY.loadError}
        loadingLabel={WELCOME_COPY.loading}
        loading={
          <View style={styles.loading}>
            <SkeletonList rows={4} rowHeight={56} />
          </View>
        }
        testID="onboarding"
      >
        {(data) => (
          <OnboardingFlow
            profile={data.profile}
            location={data.location}
            discoverable={data.privacy.discoverable}
          />
        )}
      </QueryState>
    </View>
  );
}

interface FlowProps {
  profile: NonNullable<ReturnType<typeof useMyProfile>['data']>;
  location: NonNullable<ReturnType<typeof useMyLocation>['data']>;
  discoverable: boolean;
}

function OnboardingFlow({ profile, location, discoverable: savedDiscoverable }: FlowProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const snackbar = useSnackbar();
  const uid = useUid();
  const privacy = usePrivacySettings();
  const savePrivacy = useSavePrivacy();
  const saveLocation = useSaveLocation();
  const games = useGames();
  const editor = useProfileEditor(profile, session.user?.displayName ?? '');
  const scroll = useRef<ScrollView>(null);

  // Where the welcome starts, decided once so a refresh of `/me` never moves the collector.
  const [step, setStepState] = useState<WelcomeStep>(() =>
    firstWelcomeStep(account.me?.onboarding)
  );
  const [place, setPlace] = useState<LocationDraft>(() =>
    draftFromLocation(location, account.me?.homeRegion ?? undefined)
  );
  const [placeSubmitted, setPlaceSubmitted] = useState(false);
  const [discoverable, setDiscoverable] = useState(savedDiscoverable);
  const [finishing, setFinishing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const options = useMemo(() => (games.data ? gameOptions(games.data) : null), [games.data]);
  const opensFirst = openingGame(editor.games, options);
  const busy = editor.saving !== null || finishing;

  const setStep = (next: WelcomeStep) => {
    setStepState(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  /**
   * Leaves the welcome: for the tabs, or for the link the gate remembered when it sent the
   * collector here (a deep link, a notification), which replaces this screen so that back leads
   * to the tabs. The link is taken before `/me` reloads: the gate would otherwise push it the
   * moment the account is ready, on top of this screen.
   */
  const takePendingLink = (): string | null => usePendingLink.getState().take(uid);
  const navigateAway = (pending: string | null) => {
    if (pending) {
      router.replace(pending as Href);
    } else {
      router.dismissTo('/');
    }
  };
  const continueProfile = async () => {
    if (await editor.saveDetails()) {
      setStep('games');
    }
  };

  const continueGames = async () => {
    if (editor.games.length === 0) {
      return;
    }
    if ((await editor.saveDetails()) && (await editor.saveTags())) {
      // The first picked game that has cards is the one Home and Search open on (stage G's
      // browsed game, remembered on this phone for this account).
      if (uid && opensFirst && options) {
        await pickBrowsingGame(uid, opensFirst);
      }
      setStep('place');
    }
  };

  const finish = async (withLocation: boolean) => {
    if (withLocation && missingField(place)) {
      setPlaceSubmitted(true);
      return;
    }
    setFinishing(true);
    setPlaceError(null);
    const pending = takePendingLink();
    try {
      if (withLocation) {
        if (isLocationDirty(place, location)) {
          await saveLocation.mutateAsync(locationInput(place));
        }
        const settings = privacy.data;
        if (settings && settings.discoverable !== discoverable) {
          await savePrivacy.mutateAsync({ ...settings, discoverable });
        }
      }
      await account.reload();
      snackbar.show(WELCOME_COPY.place.ready);
      // The saves above completed the profile: the account the gate renders no longer needs the
      // welcome, so it leaves right away (as before stage R12).
      navigateAway(pending);
    } catch (caught) {
      if (pending) {
        usePendingLink.getState().set(pending, uid);
      }
      setPlaceError(messageOf(caught));
    } finally {
      setFinishing(false);
    }
  };

  const previous = previousWelcomeStep(step);
  const noGame = step === 'games' && editor.games.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
    >
      <WelcomeHeader
        current={welcomeStepNumber(step)}
        total={WELCOME_STEPS.length}
        onBack={previous && !busy ? () => setStep(previous) : undefined}
        backLabel={previous ? WELCOME_COPY.backTo(STEP_NAMES[previous]) : undefined}
      />
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        testID="onboarding-scroll"
      >
        {step === 'profile' ? (
          <ProfileStep editor={editor} busy={busy} />
        ) : step === 'games' ? (
          <GamesStep
            editor={editor}
            busy={busy}
            games={options}
            gamesLoading={games.isPending}
            gamesError={games.error}
            onRetryGames={() => void games.refetch()}
            opensFirst={opensFirst}
          />
        ) : (
          <PlaceStep
            value={place}
            onChange={setPlace}
            showErrors={placeSubmitted}
            discoverable={discoverable}
            onDiscoverableChange={setDiscoverable}
            busy={busy}
            error={placeError}
          />
        )}
      </ScrollView>
      <View
        style={[
          styles.bar,
          { paddingBottom: Math.max(insets.bottom, spacing[3]) + spacing[2] },
          step === 'games' && { borderTopWidth: 1, borderTopColor: palette.border },
        ]}
      >
        {step === 'profile' ? (
          <>
            <PillButton
              label={WELCOME_COPY.continue}
              loading={busy}
              loadingLabel={WELCOME_COPY.saving}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              onPress={() => void continueProfile()}
              testID="onboarding-profile-continue"
            />
            <PillButton
              label={WELCOME_COPY.signOut}
              variant="quiet"
              disabled={busy}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              onPress={() => void session.signOut()}
              testID="onboarding-sign-out"
            />
          </>
        ) : step === 'games' ? (
          <>
            <PillButton
              label={WELCOME_COPY.continue}
              loading={busy}
              loadingLabel={WELCOME_COPY.saving}
              disabled={noGame}
              accessibilityHint={noGame ? WELCOME_COPY.games.needGame : undefined}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              onPress={() => void continueGames()}
              testID="onboarding-interests-continue"
            />
            {noGame ? (
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                testID="interests-missing"
                style={[textStyle('xs'), styles.reason, { color: palette.textMuted }]}
              >
                {WELCOME_COPY.games.needGame}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <PillButton
              label={WELCOME_COPY.place.finish}
              loading={finishing}
              loadingLabel={WELCOME_COPY.place.finishing}
              disabled={busy && !finishing}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              onPress={() => void finish(true)}
              testID="onboarding-finish"
            />
            <PillButton
              label={WELCOME_COPY.place.skip}
              variant="quiet"
              disabled={busy}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              onPress={() => void finish(false)}
              testID="onboarding-skip"
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { paddingHorizontal: spacing[5], paddingTop: spacing[4] },
  body: { paddingHorizontal: spacing[5], paddingTop: 14, paddingBottom: spacing[4] },
  bar: { paddingHorizontal: spacing[4], paddingTop: spacing[3], gap: 6 },
  reason: { textAlign: 'center' },
});
