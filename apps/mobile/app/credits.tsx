import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { newRequestId } from '@/src/api/client';
import { friendlyMessage } from '@/src/api/errorMessages';
import {
  useMyCredits,
  useMyReferral,
  useRedeemReferral,
  useSpendCredits,
} from '@/src/api/hooks/billing';
import { useMyPlan } from '@/src/api/hooks/plan';
import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import type { CreditProduct } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ScreenHeader } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import {
  creditsLabel,
  idempotencyKeyFrom,
  referralProblem,
  spendProblem,
} from '@/src/features/billing/billingLabels';
import {
  CreditBalance,
  CreditLedger,
  CreditProducts,
  ReferralCard,
  SpendDialog,
} from '@/src/features/billing/CreditParts';
import { ActiveBoosts } from '@/src/features/billing/PlanCards';
import { formatDateTime } from '@/src/lib/dates';
import { spacing, textStyle, useTheme } from '@/src/theme';

function Heading({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text accessibilityRole="header" style={[textStyle('lg', 'heading'), { color: palette.ink }]}>
      {children}
    </Text>
  );
}

/**
 * Credits (web: `/credits`): the balance with the "never withdrawable or transferable" wording,
 * the features to unlock for a day (`POST /me/credits/spend` with one idempotency key per
 * dialog; 409 INSUFFICIENT_CREDITS explained with the balance and the cost), the active boosts,
 * the referral code with "Share" and the redemption of another member's code (each refusal on the
 * field), and the append-only ledger in cursor pages. Follows the `credits` flag.
 */
export default function CreditsScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const credits = useFeature(FEATURE.credits);
  const premium = useFeature(FEATURE.premiumPlans);
  const switchedOff = credits.known && !credits.enabled;
  const ledger = useMyCredits(!switchedOff);
  const referral = useMyReferral(!switchedOff);
  const plan = useMyPlan({ fresh: true, enabled: !switchedOff });
  const spend = useSpendCredits();
  const redeem = useRedeemReferral();
  const [unlocking, setUnlocking] = useState<{ product: CreditProduct; key: string } | null>(null);
  const [spendError, setSpendError] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const first = ledger.data?.pages[0];
  const balance = first?.balance ?? 0;
  const products = (first?.products ?? []).filter((product) => product.active !== false);
  const entries = ledger.data?.pages.flatMap((page) => page.entries?.items ?? []) ?? [];
  const productNames: Record<string, string> = {};
  for (const product of products) {
    if (product.key) {
      productNames[product.key] = product.name ?? product.key;
    }
  }

  const confirmSpend = async () => {
    if (!unlocking) {
      return;
    }
    setSpendError(null);
    try {
      const result = await spend.mutateAsync({
        productKey: unlocking.product.key ?? '',
        idempotencyKey: unlocking.key,
      });
      const name = unlocking.product.name;
      setUnlocking(null);
      const until = result.entitlement?.expiresAt
        ? formatDateTime(result.entitlement.expiresAt)
        : null;
      snackbar.show(
        `${name} unlocked${until ? ` until ${until}` : ''}. Balance: ${creditsLabel(result.balance)}.`
      );
    } catch (error) {
      setSpendError(isApiError(error) ? spendProblem(error) : 'Please try again.');
    }
  };

  const redeemCode = async (code: string) => {
    setRedeemError(null);
    try {
      const result = await redeem.mutateAsync(code);
      snackbar.show(
        `Code redeemed: you earned ${creditsLabel(result.reward)}. Welcome to OrenjiTrade!`
      );
    } catch (error) {
      setRedeemError(isApiError(error) ? referralProblem(error) : 'Please try again.');
    }
  };

  let content;
  if (switchedOff || ledger.error?.errorCode === 'FEATURE_DISABLED') {
    content = (
      <EmptyState
        testID="credits-disabled"
        icon="hand-coin-outline"
        title="Credits are not available right now"
        description="Please try again later."
      />
    );
  } else if (ledger.error && !ledger.data) {
    content = (
      <ErrorState
        testID="credits-error"
        error={ledger.error}
        title="Your credits could not load"
        onRetry={() => void ledger.refetch()}
      />
    );
  } else if (!ledger.data) {
    content = (
      <View
        style={styles.root}
        accessibilityLabel="Loading your credits"
        aria-busy
        testID="credits-loading"
      >
        <Skeleton height={140} />
        <Skeleton height={160} />
        <SkeletonList rows={4} rowHeight={48} />
      </View>
    );
  } else {
    content = (
      <View style={styles.root}>
        <CreditBalance balance={balance} />

        <View style={styles.section}>
          <Heading>Unlock for a day</Heading>
          <CreditProducts
            products={products}
            balance={balance}
            onUnlock={(product) => {
              setSpendError(null);
              // One idempotency key per dialog: a retry never spends twice.
              setUnlocking({ product, key: idempotencyKeyFrom('spend', newRequestId()) });
            }}
          />
        </View>

        <View style={styles.section}>
          <Heading>Active boosts</Heading>
          <ActiveBoosts
            entitlements={plan.data?.entitlements ?? []}
            emptyText="Nothing unlocked right now. Unlocks start as soon as you confirm."
          />
        </View>

        <View style={styles.section}>
          <Heading>Referrals</Heading>
          {referral.data ? (
            <ReferralCard
              referral={referral.data}
              redeeming={redeem.isPending}
              error={redeemError}
              onRedeem={(code) => void redeemCode(code)}
            />
          ) : referral.error ? (
            <ErrorState
              compact
              testID="referral-error"
              error={referral.error}
              title="Your referral code could not load"
              message={friendlyMessage(referral.error)}
              onRetry={() => void referral.refetch()}
            />
          ) : (
            <Skeleton height={140} />
          )}
        </View>

        <View style={styles.section}>
          <Heading>History</Heading>
          <CreditLedger entries={entries} productNames={productNames} />
          {ledger.hasNextPage || ledger.isFetchNextPageError ? (
            <Button
              label={
                ledger.isFetchingNextPage
                  ? 'Loading…'
                  : ledger.isFetchNextPageError
                    ? 'Try again'
                    : 'Load more'
              }
              variant="secondary"
              disabled={ledger.isFetchingNextPage}
              onPress={() => void ledger.fetchNextPage()}
              testID="ledger-more"
            />
          ) : null}
          {ledger.isFetchNextPageError ? (
            <Text accessibilityRole="alert">Older entries could not load.</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <Screen scroll safeBottom testID="screen-credits">
      <View style={styles.root}>
        <ScreenHeader
          title="Credits"
          subtitle="Earn credits by inviting collectors and spend them to unlock features for a day."
        />
        {premium.enabled ? (
          <Button
            label="Premium"
            icon="crown-outline"
            variant="secondary"
            onPress={() => router.push('/premium')}
            style={styles.premium}
            testID="credits-premium"
          />
        ) : null}
        {content}
      </View>
      <SpendDialog
        product={unlocking?.product ?? null}
        balance={balance}
        busy={spend.isPending}
        problem={spendError}
        onConfirm={() => void confirmSpend()}
        onCancel={() => setUnlocking(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  section: { gap: spacing[3] },
  premium: { alignSelf: 'flex-start' },
});
