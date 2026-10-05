import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useOffer } from '@/src/api/hooks/offers';
import type { OfferResponse } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { OfferEditor, type CounterContext } from '@/src/features/offers/OfferEditor';
import { isLiveOffer } from '@/src/features/offers/offerLabels';
import { offerTargetFromItem, sellerFromParty } from '@/src/features/offers/offerTarget';

/**
 * "Counter" (web: the make-offer dialog in counter mode): the live proposal `?id=` read again,
 * answered with other terms and the version on screen. A refusal because the offer changed in
 * the meantime (409 STALE_OFFER, NOT_YOUR_TURN, ...) goes back to the offer with the reason.
 */
export default function CounterOfferScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const snackbar = useSnackbar();
  const offer = useOffer(id);
  // The proposal answered: kept as it was when the form opened (a refetch must not reset it).
  const [answered, setAnswered] = useState<OfferResponse | null>(null);
  if (!answered && offer.data) {
    setAnswered(offer.data);
  }

  const backToOffer = (offerId: string) =>
    router.replace({ pathname: '/offers/[id]', params: { id: offerId } });

  let content;
  if (answered) {
    const other = answered.viewerRole === 'SELLER' ? answered.buyer : answered.seller;
    const counter: CounterContext = {
      offer: answered,
      viewerRole: answered.viewerRole,
      otherName: other.displayName,
    };
    if (!answered.item) {
      content = (
        <EmptyState
          testID="counter-unavailable"
          icon="cards-outline"
          title="This card is no longer available"
          description="The offer cannot be countered any more."
          actionLabel="Back to the offer"
          onAction={() => backToOffer(answered.id)}
        />
      );
    } else if (
      !answered.allowedActions.includes('COUNTER') ||
      answered.superseded ||
      !isLiveOffer(answered.status)
    ) {
      content = (
        <EmptyState
          testID="counter-not-allowed"
          icon="swap-horizontal"
          title="You cannot counter this offer now"
          description={`It is ${other.displayName}'s turn, or the negotiation is closed.`}
          actionLabel="Back to the offer"
          onAction={() => backToOffer(answered.id)}
        />
      );
    } else {
      content = (
        <OfferEditor
          target={offerTargetFromItem(answered.item, sellerFromParty(answered.seller))}
          counter={counter}
          onSent={(created) => {
            snackbar.show(
              `Counter-offer sent. ${other.displayName} has until its expiry to answer.`
            );
            backToOffer(created.id);
          }}
          onStale={(problem) => {
            snackbar.show(problem.message, { tone: 'error', duration: 6000 });
            backToOffer(problem.latestOfferId ?? answered.id);
          }}
        />
      );
    }
  } else if (offer.error?.status === 404 || offer.error?.errorCode === 'VALIDATION_FAILED') {
    content = (
      <EmptyState
        testID="counter-not-found"
        icon="tag-off-outline"
        title="This offer is not available"
        description="It does not exist, or you are not one of the two collectors of this negotiation."
        actionLabel="My offers"
        onAction={() => router.replace('/offers')}
      />
    );
  } else if (offer.error) {
    content = (
      <ErrorState
        testID="counter-error"
        error={offer.error}
        title="This offer could not load"
        onRetry={() => void offer.refetch()}
      />
    );
  } else {
    content = (
      <View accessibilityLabel="Loading the offer" aria-busy>
        <SkeletonList rows={4} rowHeight={72} testID="counter-loading" />
      </View>
    );
  }

  return (
    <Screen scroll safeBottom testID="screen-offer-counter">
      {content}
    </Screen>
  );
}
