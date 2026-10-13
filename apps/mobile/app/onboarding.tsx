import { Stack, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { needsAgeConfirmation } from '@/src/account/accountStatus';
import { usePendingLink } from '@/src/account/pendingLink';
import { messageOf } from '@/src/api/errorMessages';
import { useLegalDocuments } from '@/src/api/hooks/legal';
import {
  useMyLocation,
  usePrivacySettings,
  useSaveLocation,
  useSavePrivacy,
} from '@/src/api/hooks/location';
import { useMyProfile } from '@/src/api/hooks/profile';
import { useSession } from '@/src/auth/session';
import { ScreenHeader } from '@/src/components/ui/Layout';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { ageConfirmationOf, ageConsentFor } from '@/src/features/legal/ageConfirmation';
import {
  draftFromLocation,
  isLocationDirty,
  locationInput,
  missingField,
  type LocationDraft,
} from '@/src/features/location/locationDraft';
import {
  AgeStep,
  InterestsStep,
  LocationStep,
  ProfileStep,
} from '@/src/features/onboarding/OnboardingSteps';
import { StepIndicator } from '@/src/features/onboarding/StepIndicator';
import { useProfileEditor } from '@/src/features/profile/useProfileEditor';
import { spacing } from '@/src/theme';

type StepName = 'age' | 'profile' | 'interests' | 'location';

const STEP_LABELS: Record<StepName, string> = {
  age: 'Age',
  profile: 'Profile',
  interests: 'Interests',
  location: 'Location',
};

/**
 * Onboarding after sign-up (web: `/onboarding`): the 18+ confirmation first when the account
 * never gave it (existing collectors confirm on their next sign-in and go straight back), then
 * profile (handle, name, bio), interests (games, languages, tags) and "Where are you?" (country,
 * state or province, optional city; ADR 0017) with the map opt-in, off by default.
 */
export default function OnboardingScreen() {
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
    <Screen scroll safeBottom testID="screen-onboarding">
      <Stack.Screen
        options={{ title: 'Welcome', headerBackVisible: false, gestureEnabled: false }}
      />
      <ScreenHeader
        eyebrow="Welcome to OrenjiTrade"
        title="Let's set up your collector profile"
        subtitle="A few quick steps so collectors of your region can find you. You can change everything later in Settings."
      />
      <QueryState
        query={combined}
        errorTitle="We could not load your profile"
        loading={<SkeletonList rows={4} rowHeight={56} />}
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
    </Screen>
  );
}

interface FlowProps {
  profile: NonNullable<ReturnType<typeof useMyProfile>['data']>;
  location: NonNullable<ReturnType<typeof useMyLocation>['data']>;
  discoverable: boolean;
}

function OnboardingFlow({ profile, location, discoverable: savedDiscoverable }: FlowProps) {
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const snackbar = useSnackbar();
  const privacy = usePrivacySettings();
  const savePrivacy = useSavePrivacy();
  const saveLocation = useSaveLocation();
  const legal = useLegalDocuments();
  const editor = useProfileEditor(profile, session.user?.displayName ?? '');

  // The steps of this visit, decided once so indexes never shift: only an API that reports
  // `ageConfirmed === false` adds the age step; the other flags pick where to start.
  const [steps] = useState<readonly StepName[]>(() => {
    const rest: StepName[] = ['profile', 'interests', 'location'];
    return needsAgeConfirmation(account.me ?? undefined) ? ['age', ...rest] : rest;
  });
  // An existing collector who only misses the confirmation is done right after it.
  const [ageOnly] = useState(() => {
    const onboarding = account.me?.onboarding;
    return steps[0] === 'age' && !!onboarding?.profileComplete && !!onboarding.interestsSet;
  });
  const [step, setStep] = useState<StepName>(() => {
    const onboarding = account.me?.onboarding;
    if (steps[0] === 'age') {
      return 'age';
    }
    return !onboarding?.profileComplete
      ? 'profile'
      : !onboarding.interestsSet
        ? 'interests'
        : 'location';
  });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [ageSubmitted, setAgeSubmitted] = useState(false);
  const [ageBusy, setAgeBusy] = useState(false);
  const [ageDone, setAgeDone] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [place, setPlace] = useState<LocationDraft>(() =>
    draftFromLocation(location, account.me?.homeRegion ?? undefined)
  );
  const [placeSubmitted, setPlaceSubmitted] = useState(false);
  const [discoverable, setDiscoverable] = useState(savedDiscoverable);
  const [finishing, setFinishing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const ageConfirmation = ageConfirmationOf(legal.data);

  /**
   * Leaves onboarding: for the tabs, or for the link the gate remembered when it sent the
   * collector here (a deep link, a notification), which replaces this screen so that back leads
   * to the tabs. The link is taken before `/me` reloads: the gate would otherwise push it the
   * moment the account is ready, on top of this screen. The navigation itself waits until the
   * rendered account no longer needs onboarding (`leaving` + the effect below): right after the
   * confirmation the query cache is fresh but the gate's render is still one step behind, and a
   * navigation at that moment makes it push this screen again (seen on Android).
   */
  const takePendingLink = (): string | null => {
    const href = usePendingLink.getState().href;
    usePendingLink.getState().clear();
    return href;
  };
  const navigateAway = (pending: string | null) => {
    if (pending) {
      router.replace(pending as Href);
    } else {
      router.dismissTo('/');
    }
  };
  const [leaving, setLeaving] = useState<{ pending: string | null } | null>(null);
  const needsOnboarding = account.needsOnboarding;
  useEffect(() => {
    if (leaving && !needsOnboarding) {
      navigateAway(leaving.pending);
    }
    // navigateAway only reads the router, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving, needsOnboarding]);
  /**
   * `wait`: the step that flips `needsOnboarding` (the 18+ confirmation of an existing account)
   * leaves once the rendered account reflects it; the end of a full onboarding already renders
   * a complete profile and leaves right away.
   */
  const leave = (pending: string | null, wait = false) => {
    if (wait) {
      setLeaving({ pending });
    } else {
      navigateAway(pending);
    }
  };

  /**
   * Records the 18+ confirmation. Accounts that already finished the other steps (existing
   * collectors confirming on their next sign-in) are done right away and go back to where they
   * came from.
   */
  const confirmAge = async () => {
    setAgeSubmitted(true);
    if (!ageConfirmed || !ageConfirmation) {
      return;
    }
    setAgeBusy(true);
    setAgeError(null);
    const pending = ageOnly ? takePendingLink() : null;
    try {
      await account.acceptConsents([ageConsentFor(ageConfirmation)]);
      setAgeDone(true);
      if (ageOnly) {
        snackbar.show('Thanks for confirming. Welcome back!', { duration: 8000 });
        leave(pending, true);
        return;
      }
      setStep('profile');
    } catch (caught) {
      if (pending) {
        // Not recorded: the collector stays here, so the remembered link waits for the retry.
        usePendingLink.getState().set(pending);
      }
      setAgeError(messageOf(caught));
    } finally {
      setAgeBusy(false);
    }
  };

  const continueProfile = async () => {
    if (await editor.saveDetails()) {
      setStep('interests');
    }
  };

  const continueInterests = async () => {
    if (!editor.hasInterests) {
      setShowMissing(true);
      return;
    }
    setShowMissing(false);
    if ((await editor.saveDetails()) && (await editor.saveTags())) {
      setStep('location');
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
      snackbar.show('Welcome to OrenjiTrade! Your profile is ready.');
      leave(pending);
    } catch (caught) {
      if (pending) {
        usePendingLink.getState().set(pending);
      }
      setPlaceError(messageOf(caught));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <View style={styles.flow}>
      <StepIndicator
        steps={steps.map((name) => STEP_LABELS[name])}
        current={Math.max(0, steps.indexOf(step))}
      />
      {step === 'age' ? (
        <AgeStep
          checked={ageConfirmed}
          onChange={setAgeConfirmed}
          showError={ageSubmitted && !ageConfirmed}
          documents={
            legal.isPending ? 'loading' : legal.isError && !ageConfirmation ? 'error' : 'ready'
          }
          documentsError={legal.error}
          onRetryDocuments={() => void legal.refetch()}
          busy={ageBusy}
          done={ageDone}
          error={ageError}
          onContinue={() => void confirmAge()}
          onSignOut={() => void session.signOut()}
        />
      ) : step === 'profile' ? (
        <ProfileStep
          editor={editor}
          busy={editor.saving !== null}
          onContinue={() => void continueProfile()}
        />
      ) : step === 'interests' ? (
        <InterestsStep
          editor={editor}
          busy={editor.saving !== null}
          showMissing={showMissing}
          onBack={() => setStep('profile')}
          onContinue={() => void continueInterests()}
        />
      ) : (
        <LocationStep
          value={place}
          onChange={setPlace}
          showErrors={placeSubmitted}
          discoverable={discoverable}
          onDiscoverableChange={setDiscoverable}
          busy={finishing}
          error={placeError}
          onBack={() => setStep('interests')}
          onSkip={() => void finish(false)}
          onFinish={() => void finish(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { gap: spacing[2] },
});
