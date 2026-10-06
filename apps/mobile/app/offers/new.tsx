import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { OfferEditor } from '@/src/features/offers/OfferEditor';
import { offerTargetFor } from '@/src/features/offers/offerTargetStore';

/**
 * "Make an offer" (web: the make-offer dialog) on the card whose "Make an offer" was pressed
 * (`?item=<public item id>`; the entry point hands the card over in memory). Once sent, the
 * offer opens with a confirmation.
 */
export default function NewOfferScreen() {
  const { item } = useLocalSearchParams<{ item?: string }>();
  const router = useRouter();
  const snackbar = useSnackbar();
  // Read once: the form keeps working with this card even if the store changes meanwhile.
  const [target] = useState(() => offerTargetFor(item));

  return (
    <Screen scroll safeBottom testID="screen-offer-new">
      {target ? (
        <OfferEditor
          target={target}
          onSent={(offer) => {
            snackbar.show(`Offer sent to ${target.seller.displayName}.`);
            router.replace({ pathname: '/offers/[id]', params: { id: offer.id } });
          }}
        />
      ) : (
        <EmptyState
          testID="offer-new-missing"
          icon="tag-off-outline"
          title="Choose the card again"
          description="Open the card you want on a binder, a profile, the map or your wishlist matches, then press “Make an offer”."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      )}
    </Screen>
  );
}
