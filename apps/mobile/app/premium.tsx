import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import {
  useCancelSubscription,
  usePlans,
  useStartSubscriptionCheckout,
} from '@/src/api/hooks/billing';
import { useMyPlan } from '@/src/api/hooks/plan';
import { FEATURE, useFeatureFlags } from '@/src/api/hooks/featureFlags';
import type { Plan } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { ScreenHeader, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { checkoutProblem, humanizeKey, usageRows } from '@/src/features/billing/billingLabels';
import {
  ActiveBoosts,
  PlanCard,
  SubscriptionCard,
  UsageMeters,
} from '@/src/features/billing/PlanCards';
import { isEntitling } from '@/src/features/checkout/useProviderCheckout';
import { checkoutTarget } from '@/src/features/payments/checkoutTargets';
import { formatLongDate } from '@/src/lib/dates';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

type CancelDialog = { kind: 'close' } | { kind: 'end' } | { kind: 'now' } | null;

/** The description of a limit key from the plans (`GET /plans`), or the key in words. */
function limitDescription(plans: readonly Plan[] | undefined, key: string): string {
  for (const plan of plans ?? []) {
    const limit = plan.limits?.find((entry) => entry.key === key);
    if (limit?.description) {
      return limit.description;
    }
  }
  return humanizeKey(key);
}

/**
 * Premium (web: `/premium`): the plans with their limits and features (`GET /plans`), the live
 * subscription (`GET /me/plan`), "Upgrade to Premium" → `POST /me/subscription/checkout` → the
 * local fake billing checkout screen (409 ALREADY_SUBSCRIBED explained), "Continue to checkout",
 * cancel at the period end, now, or close an open checkout (each confirmed), the usage of every
 * limit with boosts, and a credits teaser. Follows `premiumPlans`: switched off, Premium is "not
 * available yet" unless a subscription is still live. Limit-reached prompts lead here.
 * `?checkout=success` welcomes a new member.
 */
export default function PremiumScreen() {
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const account = useAccount();
  const flags = useFeatureFlags();
  const plans = usePlans();
  const myPlan = useMyPlan({ fresh: true });
  const start = useStartSubscriptionCheckout();
  const cancel = useCancelSubscription();
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<CancelDialog>(null);
  const scroll = useRef<ScrollView>(null);

  const premiumEnabled = flags.data?.[FEATURE.premiumPlans] === true;
  const creditsEnabled = flags.data?.[FEATURE.credits] === true;
  const subscription = myPlan.data?.subscription ?? null;
  const currentPlan = myPlan.data?.plan?.code ?? account.me?.plan ?? null;
  const welcome = checkout === 'success' && currentPlan !== null && currentPlan !== 'FREE';

  // Back from the checkout (this screen may still be scrolled down to the plans): show the
  // welcome at the top.
  useEffect(() => {
    if (welcome) {
      scroll.current?.scrollTo({ y: 0, animated: false });
    }
  }, [welcome]);
  const openCheckout = (code: string | undefined) =>
    subscription?.status === 'PENDING' && subscription.planCode === code
      ? checkoutTarget(subscription.checkoutUrl)
      : null;
  const lockedBy = (code: string | undefined) =>
    !!subscription && isEntitling(subscription.status) && subscription.planCode !== code;

  const go = (target: ReturnType<typeof checkoutTarget>) => {
    if (target?.kind === 'app' && target.screen === 'billing') {
      router.push({ pathname: '/checkout/fake-billing/[ref]', params: { ref: target.ref } });
    } else if (target?.kind === 'external') {
      void Linking.openURL(target.url);
    } else {
      setCheckoutError(
        'The billing provider did not return a checkout page. Please try again later.'
      );
    }
  };

  const upgrade = async (code: string) => {
    setCheckoutError(null);
    setUpgrading(code);
    try {
      const answer = await start.mutateAsync(code);
      go(checkoutTarget(answer.url ?? answer.subscription?.checkoutUrl));
    } catch (error) {
      setCheckoutError(isApiError(error) ? checkoutProblem(error) : 'Please try again.');
    } finally {
      setUpgrading(null);
    }
  };

  const end = subscription?.currentPeriodEnd ? formatLongDate(subscription.currentPeriodEnd) : null;
  const confirmCancel = async () => {
    if (!dialog || !subscription) {
      return;
    }
    const pending = dialog.kind === 'close';
    try {
      const result = await cancel.mutateAsync(dialog.kind === 'end');
      setDialog(null);
      snackbar.show(
        pending
          ? 'The checkout is closed.'
          : result.status === 'CANCELLED' || result.status === 'EXPIRED'
            ? 'Premium is cancelled. You are on the free plan now.'
            : end
              ? `Premium is cancelled and ends on ${end}.`
              : 'Premium is cancelled at the end of the period.'
      );
    } catch (error) {
      setDialog(null);
      snackbar.show(
        isApiError(error) && error.status === 404
          ? 'There is no subscription to cancel.'
          : isApiError(error)
            ? friendlyMessage(error)
            : 'Please try again.',
        { tone: 'error' }
      );
    }
  };

  let plansContent;
  if (flags.isPending) {
    plansContent = (
      <View
        style={styles.plans}
        accessibilityLabel="Loading plans"
        aria-busy
        testID="premium-loading"
      >
        <Skeleton height={220} />
        <Skeleton height={220} />
      </View>
    );
  } else if (!premiumEnabled && !subscription) {
    plansContent = (
      <EmptyState
        testID="premium-unavailable"
        icon="crown-outline"
        title="Premium is not available yet"
        description="Every collector uses the free plan for now. We will let you know when Premium opens."
      />
    );
  } else {
    plansContent = (
      <View style={styles.plans}>
        {subscription ? (
          <SubscriptionCard
            subscription={subscription}
            busy={cancel.isPending}
            onContinue={(() => {
              const target = checkoutTarget(subscription.checkoutUrl);
              return target?.kind === 'app' ? () => go(target) : null;
            })()}
            onCancelAtPeriodEnd={() => setDialog({ kind: 'end' })}
            onCancelNow={() =>
              setDialog(subscription.status === 'PENDING' ? { kind: 'close' } : { kind: 'now' })
            }
          />
        ) : null}
        {premiumEnabled ? (
          plans.error && !plans.data ? (
            <ErrorState
              testID="plans-error"
              error={plans.error}
              title="Plans could not load"
              onRetry={() => void plans.refetch()}
            />
          ) : !plans.data ? (
            <View accessibilityLabel="Loading plans" aria-busy>
              <Skeleton height={220} />
            </View>
          ) : plans.data.length === 0 ? (
            <EmptyState
              icon="crown-outline"
              title="No plans are offered right now"
              testID="plans-empty"
            />
          ) : (
            plans.data.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                current={currentPlan === plan.code}
                highlight={plan.code === 'PREMIUM'}
                busy={upgrading === plan.code}
                hasOpenCheckout={!!openCheckout(plan.code)}
                locked={lockedBy(plan.code)}
                onUpgrade={() => void upgrade(plan.code ?? '')}
                onContinue={() => go(openCheckout(plan.code))}
              />
            ))
          )
        ) : null}
      </View>
    );
  }

  const dialogText =
    dialog?.kind === 'close'
      ? {
          title: 'Close the open checkout?',
          message: 'Nothing was charged. You can start a new checkout from the plans any time.',
          confirm: 'Close the checkout',
          cancel: 'Keep it open',
        }
      : dialog?.kind === 'end'
        ? {
            title: 'Cancel Premium at the end of the period?',
            message: end
              ? `Premium stays until ${end}. After that you are back on the free plan and its limits.`
              : 'Premium stays until the end of the paid period, then you are back on the free plan.',
            confirm: 'Cancel at period end',
            cancel: 'Keep Premium',
          }
        : {
            title: 'Cancel Premium now?',
            message:
              'Premium ends right away and the free plan’s limits apply at once (binders, wishlist and ads).',
            confirm: 'Cancel now',
            cancel: 'Keep Premium',
          };

  return (
    <Screen scroll safeBottom scrollRef={scroll} testID="screen-premium">
      <View style={styles.root}>
        <ScreenHeader
          title="Premium"
          subtitle="More binder views and alerts, advanced filters and no ads."
        />
        {welcome ? (
          <View
            testID="premium-welcome"
            accessibilityRole="summary"
            style={[styles.welcome, { backgroundColor: palette.primaryContainer }]}
          >
            <MaterialCommunityIcons
              name="party-popper"
              size={20}
              color={palette.onPrimaryContainer}
            />
            <Text style={[textStyle('sm'), styles.grow, { color: palette.onPrimaryContainer }]}>
              Welcome to Premium! Your new limits apply right away. Thank you for supporting
              OrenjiTrade.
            </Text>
          </View>
        ) : null}
        {checkoutError ? <FormMessage testID="premium-problem">{checkoutError}</FormMessage> : null}

        {plansContent}

        <SectionCard title="Your usage" testID="premium-usage">
          {myPlan.error && !myPlan.data ? (
            <ErrorState
              compact
              testID="usage-error"
              error={myPlan.error}
              title="Your usage could not load"
              onRetry={() => void myPlan.refetch()}
            />
          ) : myPlan.data ? (
            <View style={styles.usage}>
              <UsageMeters
                rows={usageRows(myPlan.data.limits, (key) => limitDescription(plans.data, key))}
              />
              {(myPlan.data.entitlements ?? []).length > 0 ? (
                <View style={styles.usage}>
                  <Text
                    accessibilityRole="header"
                    style={[textStyle('md', 'heading'), { color: palette.ink }]}
                  >
                    Active boosts
                  </Text>
                  <ActiveBoosts entitlements={myPlan.data.entitlements ?? []} />
                </View>
              ) : null}
            </View>
          ) : (
            <SkeletonList rows={3} rowHeight={36} />
          )}
        </SectionCard>

        {creditsEnabled && currentPlan !== 'PREMIUM' ? (
          <View
            testID="premium-credits"
            style={[styles.teaser, { backgroundColor: palette.accentContainer }]}
          >
            <View style={styles.teaserText}>
              <MaterialCommunityIcons
                name="hand-coin-outline"
                size={22}
                color={palette.onAccentContainer}
              />
              <Text style={[textStyle('sm'), styles.grow, { color: palette.onAccentContainer }]}>
                Only need it for a day? Unlock advanced filters, unlimited binder views or a wider
                map for 24 hours with your OrenjiTrade credits.
              </Text>
            </View>
            <Button
              label="Use credits"
              variant="secondary"
              onPress={() => router.push('/credits')}
              testID="premium-use-credits"
            />
          </View>
        ) : null}
      </View>

      <ConfirmDialog
        visible={dialog !== null}
        title={dialogText.title}
        message={dialogText.message}
        confirmLabel={dialogText.confirm}
        cancelLabel={dialogText.cancel}
        tone={dialog?.kind === 'now' ? 'danger' : 'default'}
        busy={cancel.isPending}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setDialog(null)}
        testID="subscription-dialog"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  plans: { gap: spacing[3] },
  usage: { gap: spacing[3] },
  grow: { flex: 1 },
  welcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
  },
  teaser: { gap: spacing[3], borderRadius: radius.md, padding: spacing[3] },
  teaserText: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
});
