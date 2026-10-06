import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';

import { friendlyMessage } from '@/src/api/errorMessages';
import { confirmFakeDonationCheckout, readFakeDonationCheckout } from '@/src/api/hooks/billing';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys, publicKeys } from '@/src/api/queryKeys';
import type { FakeDonationCheckout } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import {
  DONATION_NOTE,
  amountLabel,
  donationStatusInfo,
} from '@/src/features/billing/billingLabels';
import { FakeProviderCheckout } from '@/src/features/checkout/FakeProviderCheckout';
import {
  donationOutcome,
  useProviderCheckout,
  type CheckoutOutcome,
} from '@/src/features/checkout/useProviderCheckout';
import { textStyle, useTheme } from '@/src/theme';

function doneText(outcome: CheckoutOutcome | null): string {
  switch (outcome) {
    case 'succeeded':
      return 'Thank you for supporting OrenjiTrade!';
    case 'failed':
      return 'The payment was declined. Nothing was charged; you can start a new donation.';
    case 'cancelled':
      return 'This donation was refunded.';
    default:
      return 'The provider has not answered yet. Your donation history updates as soon as it does.';
  }
}

/**
 * `checkout/fake-donation/[ref]` (web: `/checkout/fake-donation/:ref`): the local stand-in for the
 * donation provider's checkout (the donor only). "Pay" confirms the voluntary donation through a
 * synthetic signed webhook; the donor then lands on Support with a thank-you.
 */
export default function FakeDonationCheckoutScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const queryClient = useQueryClient();
  const uid = useUid();
  const checkout = useProviderCheckout<FakeDonationCheckout>('donation', ref, {
    read: readFakeDonationCheckout,
    send: confirmFakeDonationCheckout,
    outcomeOf: donationOutcome,
  });
  const data = checkout.checkout;

  const toSupport = (thanks: boolean) => {
    void queryClient.invalidateQueries({ queryKey: meKeys.donations(uid) });
    void queryClient.invalidateQueries({ queryKey: publicKeys.supporters });
    router.dismissTo(
      thanks ? { pathname: '/support', params: { donation: 'thanks' } } : '/support'
    );
  };

  const confirm = async (outcome: 'SUCCEEDED' | 'FAILED') => {
    if ((await checkout.confirm(outcome)) === 'succeeded') {
      toSupport(true);
    }
  };

  if (checkout.status === 'not-found') {
    return (
      <Screen scroll safeBottom testID="screen-donation-checkout">
        <EmptyState
          testID="checkout-not-found"
          icon="credit-card-off-outline"
          title="This checkout is not available"
          description="It does not exist, it belongs to another member, or this provider has no local checkout."
          actionLabel="Support OrenjiTrade"
          onAction={() => router.replace('/support')}
        />
      </Screen>
    );
  }
  if (checkout.status === 'error') {
    return (
      <Screen scroll safeBottom testID="screen-donation-checkout">
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
    <Screen scroll safeBottom testID="screen-donation-checkout">
      <FakeProviderCheckout
        status={checkout.status}
        outcome={checkout.outcome}
        eyebrow="Voluntary support"
        icon="hand-heart-outline"
        heading="Support OrenjiTrade"
        summary={data?.summary ?? null}
        amount={amount}
        statusInfo={donationStatusInfo(data?.status)}
        payLabel={`Donate ${amount}`}
        problem={
          checkout.error ? `The payment could not start: ${friendlyMessage(checkout.error)}` : null
        }
        doneText={doneText(checkout.outcome)}
        doneLabel="Back to support"
        onDone={() => toSupport(checkout.outcome === 'succeeded')}
        backLabel="Cancel and return"
        onBack={() => toSupport(false)}
        onPay={() => void confirm('SUCCEEDED')}
        onDecline={() => void confirm('FAILED')}
      >
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{DONATION_NOTE}</Text>
      </FakeProviderCheckout>
    </Screen>
  );
}
