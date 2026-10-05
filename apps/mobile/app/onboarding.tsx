import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { messageOf } from '@/src/api/errorMessages';
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
import {
  areaInput,
  draftFromLocation,
  isAreaDirty,
  type AreaDraft,
} from '@/src/features/location/tradingArea';
import { AreaStep, InterestsStep, ProfileStep } from '@/src/features/onboarding/OnboardingSteps';
import { StepIndicator } from '@/src/features/onboarding/StepIndicator';
import { useProfileEditor } from '@/src/features/profile/useProfileEditor';
import { spacing } from '@/src/theme';

const STEPS = ['Profile', 'Interests', 'Trading area'] as const;

/**
 * Onboarding after sign-up (web: `/onboarding`): profile (handle, name, bio), interests (games,
 * languages, tags) and trading area (city or device, radius) with the map opt-in, off by default.
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
        subtitle="Three quick steps so collectors nearby can find you. You can change everything later in Settings."
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
  const editor = useProfileEditor(profile, session.user?.displayName ?? '');

  const onboarding = account.me?.onboarding;
  const [step, setStep] = useState(() =>
    !onboarding?.profileComplete ? 0 : !onboarding.interestsSet ? 1 : 2
  );
  const [showMissing, setShowMissing] = useState(false);
  const [area, setArea] = useState<AreaDraft>(() => draftFromLocation(location));
  const [discoverable, setDiscoverable] = useState(savedDiscoverable);
  const [finishing, setFinishing] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);
  const continueProfile = async () => {
    if (await editor.saveDetails()) {
      setStep(1);
    }
  };

  const continueInterests = async () => {
    if (!editor.hasInterests) {
      setShowMissing(true);
      return;
    }
    setShowMissing(false);
    if ((await editor.saveDetails()) && (await editor.saveTags())) {
      setStep(2);
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
      <StepIndicator steps={STEPS} current={step} />
      {step === 0 ? (
        <ProfileStep
          editor={editor}
          busy={editor.saving !== null}
          onContinue={() => void continueProfile()}
        />
      ) : step === 1 ? (
        <InterestsStep
          editor={editor}
          busy={editor.saving !== null}
          showMissing={showMissing}
          onBack={() => setStep(0)}
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
          onBack={() => setStep(1)}
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
