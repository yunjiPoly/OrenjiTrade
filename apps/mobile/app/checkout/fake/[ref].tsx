import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { friendlyMessage } from '@/src/api/errorMessages';
import { confirmFakeCheckout, readFakeCheckout } from '@/src/api/hooks/payments';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import type { FakeCheckout } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { FakeProviderCheckout } from '@/src/features/checkout/FakeProviderCheckout';
import {
  paymentOutcome,
  useProviderCheckout,
  type CheckoutOutcome,
} from '@/src/features/checkout/useProviderCheckout';
import { money, paymentStatusInfo } from '@/src/features/payments/paymentLabels';
import { ProtectionExplainer } from '@/src/features/payments/ProtectionExplainer';

function doneText(outcome: CheckoutOutcome | null): string {
  switch (outcome) {
    case 'succeeded':
      return 'This payment is secured: the payment provider holds it until the buyer confirms receipt.';
    case 'failed':
      return 'This payment did not go through. Nothing was charged; you can try again from the trade.';
    case 'cancelled':
      return 'This checkout was cancelled.';
    default:
      return 'The payment provider has not answered yet. The trade updates as soon as it does.';
  }
}

/**
 * `checkout/fake/[ref]` (web: `/checkout/fake/:ref`): the local stand-in for a payment provider's
 * hosted checkout of a protected trade (only with the fake provider; the buyer only, anybody else
 * gets the not-found state). A banner says it is a local test payment: no card is asked for and
 * no money moves. "Pay" and "Simulate a failed payment" send the synthetic webhook; once the
 * provider answered, the buyer goes back to the trade (`?payment=secured|failed`).
 */
export default function FakeCheckoutScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const uid = useUid();
  const checkout = useProviderCheckout<FakeCheckout>('payment', ref, {
    read: readFakeCheckout,
    send: confirmFakeCheckout,
    outcomeOf: (value) => paymentOutcome(value),
  });
  const data = checkout.checkout;

  const backToTrade = (payment?: 'secured' | 'failed') => {
    if (!data) {
      router.replace('/trades');
      return;
    }
    // The trade (and the trades list) show the new payment status.
    void queryClient.invalidateQueries({ queryKey: meKeys.trades(uid) });
    router.dismissTo({
      pathname: '/trades/[id]',
      params: payment ? { id: data.tradeId, payment } : { id: data.tradeId },
    });
  };

  const confirm = async (outcome: 'SUCCEEDED' | 'FAILED') => {
    const result = await checkout.confirm(outcome);
    if (result === 'succeeded') {
      backToTrade('secured');
    } else if (result === 'failed') {
      backToTrade('failed');
    }
  };

  if (checkout.status === 'not-found') {
    return (
      <Screen scroll safeBottom testID="screen-checkout">
        <EmptyState
          testID="checkout-not-found"
          icon="credit-card-off-outline"
          title="This checkout is not available"
          description="It does not exist, it belongs to another collector, or this payment provider has no local checkout."
          actionLabel="My trades"
          onAction={() => router.replace('/trades')}
        />
      </Screen>
    );
  }
  if (checkout.status === 'error') {
    return (
      <Screen scroll safeBottom testID="screen-checkout">
        <ErrorState
          testID="checkout-error"
          error={checkout.error}
          title="The checkout could not load"
          onRetry={checkout.retry}
        />
      </Screen>
    );
  }
  const amount = data ? money(data.amount, data.currency) : '';
  return (
    <Screen scroll safeBottom testID="screen-checkout">
      <FakeProviderCheckout
        status={checkout.status}
        outcome={checkout.outcome}
        eyebrow="Protected payment"
        icon="lock-outline"
        heading={data?.summary ?? 'Protected payment'}
        amount={amount}
        statusInfo={paymentStatusInfo(data?.status)}
        payLabel={`Pay ${amount}`}
        problem={
          checkout.error ? `The payment could not start: ${friendlyMessage(checkout.error)}` : null
        }
        doneText={doneText(checkout.outcome)}
        doneLabel="Back to the trade"
        onDone={() => backToTrade()}
        backLabel="Cancel and return to the trade"
        onBack={() => backToTrade()}
        onPay={() => void confirm('SUCCEEDED')}
        onDecline={() => void confirm('FAILED')}
      >
        <ProtectionExplainer />
      </FakeProviderCheckout>
    </Screen>
  );
}
