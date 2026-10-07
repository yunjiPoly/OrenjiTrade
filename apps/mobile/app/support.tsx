import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { useMyDonations, useStartDonationCheckout, useSupporters } from '@/src/api/hooks/billing';
import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import type { DonationCheckoutRequest } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { ScreenHeader, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { DONATION_NOTE, donationProblem } from '@/src/features/billing/billingLabels';
import { DonationForm, MyDonations, SupportersList } from '@/src/features/billing/DonationParts';
import { checkoutTarget } from '@/src/features/payments/checkoutTargets';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Support OrenjiTrade (web: `/support`): a voluntary donation that never changes ratings, ranking
 * or trust (preset or custom amount, currency, private message, public-thanks opt-in; the API's
 * range errors on the fields) through the local fake donation checkout, the public supporters
 * wall (names and month only) and the member's own donations. Follows the `donations` flag.
 * `?donation=thanks` after a successful checkout.
 */
export default function SupportScreen() {
  const { donation } = useLocalSearchParams<{ donation?: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const donations = useFeature(FEATURE.donations);
  const switchedOff = donations.known && !donations.enabled;
  const supporters = useSupporters();
  const mine = useMyDonations(!switchedOff);
  const start = useStartDonationCheckout();
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    amount: string | null;
    currency: string | null;
  } | null>(null);

  const scroll = useRef<ScrollViewInstance>(null);
  const thanks = donation === 'thanks';

  // Back from the checkout (this screen may still be scrolled down to the form): show the
  // thank-you at the top.
  useEffect(() => {
    if (thanks) {
      scroll.current?.scrollTo({ y: 0, animated: false });
    }
  }, [thanks]);

  const donate = async (request: DonationCheckoutRequest) => {
    setProblem(null);
    setFieldErrors(null);
    try {
      const answer = await start.mutateAsync(request);
      const target = checkoutTarget(answer.url ?? answer.donation?.checkoutUrl);
      if (target?.kind === 'app' && target.screen === 'donation') {
        router.push({ pathname: '/checkout/fake-donation/[ref]', params: { ref: target.ref } });
      } else if (target?.kind === 'external') {
        await Linking.openURL(target.url);
      } else {
        setProblem('The payment provider did not return a checkout page. Please try again.');
      }
    } catch (error) {
      if (isApiError(error)) {
        const refusal = donationProblem(error);
        setProblem(refusal.message);
        setFieldErrors({ amount: refusal.amount, currency: refusal.currency });
      } else {
        setProblem('Please try again.');
      }
    }
  };

  if (switchedOff) {
    return (
      <Screen scroll safeBottom testID="screen-support">
        <EmptyState
          testID="support-disabled"
          icon="hand-heart-outline"
          title="Donations are not available right now"
          description="Thank you for thinking of it. Please try again later."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll safeBottom scrollRef={scroll} testID="screen-support">
      <View style={styles.root}>
        <ScreenHeader
          title="Support OrenjiTrade"
          subtitle="OrenjiTrade is built by collectors for collectors. If it helps you trade, you can chip in."
        />
        {thanks ? (
          <View
            testID="donation-thanks"
            accessibilityRole="summary"
            style={[styles.thanks, { backgroundColor: palette.primaryContainer }]}
          >
            <MaterialCommunityIcons name="heart" size={20} color={palette.onPrimaryContainer} />
            <Text style={[textStyle('sm'), styles.grow, { color: palette.onPrimaryContainer }]}>
              <Text style={styles.strong}>Thank you!</Text> Your donation went through.
            </Text>
          </View>
        ) : null}

        <SectionCard testID="support-donate">
          <View
            style={[styles.badge, { backgroundColor: palette.accentContainer }]}
            testID="voluntary-label"
          >
            <MaterialCommunityIcons
              name="hand-heart-outline"
              size={16}
              color={palette.onAccentContainer}
            />
            <Text style={[textStyle('xs'), styles.strong, { color: palette.onAccentContainer }]}>
              Voluntary support
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            style={[textStyle('lg', 'heading'), { color: palette.ink }]}
          >
            Make a donation
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{DONATION_NOTE}</Text>
          {problem ? <FormMessage testID="donation-problem">{problem}</FormMessage> : null}
          <DonationForm
            busy={start.isPending}
            serverErrors={fieldErrors}
            onDonate={(request) => void donate(request)}
          />
        </SectionCard>

        <SectionCard title="Thank you, supporters" testID="support-supporters">
          {supporters.error && !supporters.data ? (
            <ErrorState
              compact
              testID="supporters-error"
              error={supporters.error}
              title="The supporters could not load"
              onRetry={() => void supporters.refetch()}
            />
          ) : supporters.data ? (
            <View style={styles.root}>
              <SupportersList supporters={supporters.data.supporters ?? []} />
              {supporters.data.note ? (
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  {supporters.data.note}
                </Text>
              ) : null}
            </View>
          ) : (
            <SkeletonList rows={3} rowHeight={40} />
          )}
        </SectionCard>

        <SectionCard title="Your donations" testID="support-mine">
          {mine.error && !mine.data ? (
            <ErrorState
              compact
              testID="my-donations-error"
              error={mine.error}
              title="Your donations could not load"
              onRetry={() => void mine.refetch()}
            />
          ) : mine.data ? (
            <MyDonations donations={mine.data} />
          ) : (
            <SkeletonList rows={2} rowHeight={48} />
          )}
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  thanks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
});
