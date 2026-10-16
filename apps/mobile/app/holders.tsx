import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { usePrintingCard } from '@/src/api/hooks/search';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { CARD_PAGE_COPY } from '@/src/features/search/searchCopy';
import { holdersLinkTarget } from '@/src/features/search/searchLinks';

/**
 * The old card holders list (`/holders?card=<id>` or `?printing=<id>`, the web's
 * `/search?card=|printing=`): since stage R5 the card page is Who has this card (owner spec
 * 2026-10-14, section 4), so the link lands on `/cards/<id>`, on the printing it named. A printing
 * is looked up first to find its card.
 */
export default function HoldersRedirect() {
  const params = useLocalSearchParams<{ card?: string; printing?: string }>();
  const router = useRouter();
  const target = holdersLinkTarget(params);
  const lookup = target && !('card' in target) ? target.printing : null;
  const printingCard = usePrintingCard(lookup);

  if (target && 'card' in target) {
    return (
      <Redirect
        href={{
          pathname: '/cards/[id]',
          params: target.printing
            ? { id: target.card, printing: target.printing }
            : { id: target.card },
        }}
      />
    );
  }
  if (lookup && printingCard.data) {
    return (
      <Redirect
        href={{ pathname: '/cards/[id]', params: { id: printingCard.data, printing: lookup } }}
      />
    );
  }
  let content;
  if (!target || (lookup && printingCard.isSuccess && !printingCard.data)) {
    content = (
      <EmptyState
        testID="holders-no-card"
        icon="cards-outline"
        title={CARD_PAGE_COPY.notFound}
        description={CARD_PAGE_COPY.notFoundHint}
        actionLabel={CARD_PAGE_COPY.searchCards}
        onAction={() => router.replace({ pathname: '/search', params: { typing: '1' } })}
      />
    );
  } else if (printingCard.error) {
    content = (
      <ErrorState
        testID="holders-error"
        error={printingCard.error}
        title={CARD_PAGE_COPY.error}
        onRetry={() => void printingCard.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={3} rowHeight={72} testID="holders-loading" />;
  }
  return (
    <Screen safeBottom testID="screen-holders">
      <Stack.Screen options={{ title: 'Card' }} />
      {content}
    </Screen>
  );
}
