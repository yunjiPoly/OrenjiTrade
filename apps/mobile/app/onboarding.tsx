import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { needsAgeConfirmation } from '@/src/account/accountStatus';
import { messageOf } from '@/src/api/errorMessages';
import { useLegalDocuments } from '@/src/api/hooks/legal';
import {
  useMyLocation,
  usePrivacySettings,
  useSavePrivacy,
  useSaveTradingArea,
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
  areaInput,
  draftFromLocation,
  isAreaDirty,
  type AreaDraft,
} from '@/src/features/location/tradingArea';
import {
  AgeStep,
  AreaStep,
  InterestsStep,
  ProfileStep,
} from '@/src/features/onboarding/OnboardingSteps';
import { StepIndicator } from '@/src/features/onboarding/StepIndicator';
import { useProfileEditor } from '@/src/features/profile/useProfileEditor';
import { spacing } from '@/src/theme';

type StepName = 'age' | 'profile' | 'interests' | 'area';

const STEP_LABELS: Record<StepName, string> = {
  age: 'Age',
  profile: 'Profile',
  interests: 'Interests',
  area: 'Trading area',
};

/**
 * Onboarding after sign-up (web: `/onboarding`): the 18+ confirmation first when the account
 * never gave it (existing collectors confirm on their next sign-in and go straight back), then
 * profile (handle, name, bio), interests (games, languages, tags) and trading area (city or
 * device, radius) with the map opt-in, off by default.
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
        subtitle="A few quick steps so collectors nearby can find you. You can change everything later in Settings."
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
  const saveArea = useSaveTradingArea();
  const legal = useLegalDocuments();
  const editor = useProfileEditor(profile, session.user?.displayName ?? '');

  // The steps of this visit, decided once so indexes never shift: only an API that reports
  // `ageConfirmed === false` adds the age step; the other flags pick where to start.
  const [steps] = useState<readonly StepName[]>(() => {
    const rest: StepName[] = ['profile', 'interests', 'area'];
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
        : 'area';
  });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [ageSubmitted, setAgeSubmitted] = useState(false);
  const [ageBusy, setAgeBusy] = useState(false);
  const [ageDone, setAgeDone] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [area, setArea] = useState<AreaDraft>(() => draftFromLocation(location));
  const [discoverable, setDiscoverable] = useState(savedDiscoverable);
  const [finishing, setFinishing] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);

  const ageConfirmation = ageConfirmationOf(legal.data);

  /**
   * Records the 18+ confirmation. Accounts that already finished the other steps (existing
   * collectors confirming on their next sign-in) are done right away and go back to where they
   * came from (the gate reopens the remembered link).
   */
  const confirmAge = async () => {
    setAgeSubmitted(true);
    if (!ageConfirmed || !ageConfirmation) {
      return;
    }
    setAgeBusy(true);
    setAgeError(null);
    try {
      await account.acceptConsents([ageConsentFor(ageConfirmation)]);
      setAgeDone(true);
      if (ageOnly) {
        snackbar.show('Thanks for confirming. Welcome back!');
        router.dismissTo('/');
        return;
      }
      setStep('profile');
    } catch (caught) {
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
      setStep('area');
    }
  };

  const finish = async (withArea: boolean) => {
    setFinishing(true);
    setAreaError(null);
    try {
      if (withArea) {
        const input = areaInput(area, location);
        if (input && isAreaDirty(area, location)) {
          await saveArea.mutateAsync(input);
        }
        const settings = privacy.data;
        if (settings && settings.discoverable !== discoverable) {
          await savePrivacy.mutateAsync({ ...settings, discoverable });
        }
      }
      await account.reload();
      snackbar.show('Welcome to OrenjiTrade! Your profile is ready.');
      router.dismissTo('/');
    } catch (caught) {
      setAreaError(messageOf(caught));
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
        <AreaStep
          area={area}
          onAreaChange={setArea}
          location={location}
          discoverable={discoverable}
          onDiscoverableChange={setDiscoverable}
          busy={finishing}
          error={areaError}
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
