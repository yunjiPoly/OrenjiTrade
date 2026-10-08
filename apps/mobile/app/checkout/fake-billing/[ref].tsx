import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';

import { friendlyMessage } from '@/src/api/errorMessages';
import {
  confirmFakeBillingCheckout,
  readFakeBillingCheckout,
  refreshAfterPlanChange,
} from '@/src/api/hooks/billing';
import { useUid } from '@/src/api/hooks/useUid';
import type { FakeBillingCheckout } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { amountLabel, subscriptionStatusInfo } from '@/src/features/billing/billingLabels';
import { FakeProviderCheckout } from '@/src/features/checkout/FakeProviderCheckout';
import {
  billingOutcome,
  useProviderCheckout,
  type CheckoutOutcome,
} from '@/src/features/checkout/useProviderCheckout';
import { textStyle, useTheme } from '@/src/theme';

function doneText(outcome: CheckoutOutcome | null): string {
  switch (outcome) {
    case 'succeeded':
      return 'Payment received: Premium is active.';
    case 'failed':
      return 'The payment was declined. Nothing was charged.';
    case 'cancelled':
      return 'This checkout was closed. Start a new one from the plans.';
    default:
      return 'The billing provider has not answered yet. The Premium page updates as soon as it does.';
  }
}

/**
 * `checkout/fake-billing/[ref]` (web: `/checkout/fake-billing/:ref`): the local stand-in for the
 * billing provider's subscription checkout (the member who opened it only). "Pay" activates the
 * subscription through a synthetic signed webhook; a simulated decline leaves the checkout open
 * ("Try again"). Once paid, the account (its plan) is read again and Premium welcomes the member.
 */
export default function FakeBillingCheckoutScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const queryClient = useQueryClient();
  const uid = useUid();
  const checkout = useProviderCheckout<FakeBillingCheckout>('billing', ref, {
    read: readFakeBillingCheckout,
    send: confirmFakeBillingCheckout,
    outcomeOf: billingOutcome,
  });
  const data = checkout.checkout;

  const toPremium = (success: boolean) => {
    refreshAfterPlanChange(queryClient, uid);
    router.dismissTo(
      success ? { pathname: '/premium', params: { checkout: 'success' } } : '/premium'
    );
  };

  const confirm = async (outcome: 'SUCCEEDED' | 'FAILED') => {
    const result = await checkout.confirm(outcome);
    if (result === 'succeeded') {
      // The plan and the PREMIUM_USER role changed: read the account again before leaving.
      toPremium(true);
    }
  };

  if (checkout.status === 'not-found') {
    return (
      <Screen scroll safeBottom testID="screen-billing-checkout">
        <EmptyState
          testID="checkout-not-found"
          icon="credit-card-off-outline"
          title="This checkout is not available"
          description="It does not exist, it belongs to another member, or this provider has no local checkout."
          actionLabel="Premium"
          onAction={() => router.replace('/premium')}
        />
      </Screen>
    );
  }
  if (checkout.status === 'error') {
    return (
      <Screen scroll safeBottom testID="screen-billing-checkout">
        <ErrorState
          testID="checkout-error"
          error={checkout.error}
          title="The checkout could not load"
          onRetry={checkout.retry}
        />
      </Screen>
    );
  }
  const amount = data ? amountLabel(data.amount, data.currency) : '';
  return (
    <Screen scroll safeBottom testID="screen-billing-checkout">
      <FakeProviderCheckout
        status={checkout.status}
        outcome={checkout.outcome}
        eyebrow="Monthly subscription"
        icon="crown-outline"
        heading={`${data?.planName ?? 'Premium'} subscription`}
        summary={data?.summary ?? null}
        amount={amount}
        per="per month"
        statusInfo={subscriptionStatusInfo(data?.status)}
        payLabel={`Pay ${amount}`}
        note={
          data?.failureCode
            ? 'The last attempt was declined. Nothing was charged: you can try again.'
            : null
        }
        problem={
          checkout.error ? `The payment could not start: ${friendlyMessage(checkout.error)}` : null
        }
        doneText={doneText(checkout.outcome)}
        doneLabel={checkout.outcome === 'succeeded' ? 'Go to Premium' : 'Back to the plans'}
        onDone={() => toPremium(checkout.outcome === 'succeeded')}
        backLabel="Cancel and return to the plans"
        onBack={() => toPremium(false)}
        retryable
        onPay={() => void confirm('SUCCEEDED')}
        onDecline={() => void confirm('FAILED')}
        onTryAgain={checkout.tryAgain}
      >
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Premium renews every month until you cancel it. Cancel any time from the Premium screen:
          the plan stays until the end of the paid period.
        </Text>
      </FakeProviderCheckout>
    </Screen>
  );
}
