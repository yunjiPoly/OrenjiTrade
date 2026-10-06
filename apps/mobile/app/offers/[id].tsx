import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { useAnswerOffer, useOffer, type OfferAnswer } from '@/src/api/hooks/offers';
import type { OfferResponse } from '@/src/api/types';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { DealNotice, type DealNoticeValue } from '@/src/features/offers/DealNotice';
import { Banner, DealHeader, Pill, PrivacyNote, Section } from '@/src/features/offers/DealParts';
import { DealSummary } from '@/src/features/offers/DealSummary';
import { OfferActionBar } from '@/src/features/offers/OfferActionBar';
import { OfferHistory } from '@/src/features/offers/OfferHistory';
import {
  expiryLabel,
  isLiveOffer,
  offerKindLabel,
  offerStatusInfo,
  offerTermsText,
  type OfferActionName,
} from '@/src/features/offers/offerLabels';
import { OfferPartyCard } from '@/src/features/offers/OfferPartyCard';
import { offerProblem } from '@/src/features/offers/offerProblems';
import { ReasonDialog } from '@/src/features/offers/ReasonDialog';
import { StatusChip } from '@/src/features/offers/StatusChip';
import { spacing } from '@/src/theme';

const ANSWER_ACTION: Record<OfferAnswer, OfferActionName> = {
  accept: 'ACCEPT',
  decline: 'DECLINE',
  cancel: 'CANCEL',
};

/** "You", or the party's name. */
function nameOf(offer: OfferResponse, role: 'SELLER' | 'BUYER'): string {
  if (offer.viewerRole === role) {
    return 'You';
  }
  return role === 'SELLER' ? offer.seller.displayName : offer.buyer.displayName;
}

/**
 * One offer (the web's `/offers/:id`): the status, kind, round and expiry; whose turn it is with
 * only the answers the API allows (accept after a confirmation, counter, decline or withdraw with
 * an optional reason, message the other collector); the deal; both collectors (region label and
 * distance bucket only); the history of the whole negotiation. A proposal replaced by a
 * counter-offer links to the live one (and the screen follows it when that happens on screen);
 * an accepted offer links to its trade. Conflicts (409 STALE_OFFER, NOT_YOUR_TURN, ...) are
 * explained and the offer re-read.
 */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const offer = useOffer(id);
  const answer = useAnswerOffer();
  const { message, startingId } = useMessageCollector();
  const [notice, setNotice] = useState<DealNoticeValue | null>(null);
  const [dialog, setDialog] = useState<OfferAnswer | null>(null);
  const data = offer.data ?? null;

  // Follow the negotiation: a proposal answered by a counter-offer while it is on screen.
  const seen = useRef<{ id: string; superseded: boolean } | null>(null);
  useEffect(() => {
    if (!data) {
      return;
    }
    const before = seen.current;
    seen.current = { id: data.id, superseded: data.superseded };
    if (
      before?.id === data.id &&
      !before.superseded &&
      data.superseded &&
      data.latestOfferId !== data.id
    ) {
      const other = data.viewerRole === 'SELLER' ? data.buyer : data.seller;
      setNotice({ tone: 'info', message: `${other.displayName} answered with a counter-offer.` });
      router.setParams({ id: data.latestOfferId });
    }
  }, [data, router]);

  if (!data) {
    let content;
    if (offer.error?.status === 404 || offer.error?.errorCode === 'VALIDATION_FAILED') {
      content = (
        <EmptyState
          testID="offer-not-found"
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
          testID="offer-error-state"
          error={offer.error}
          title="This offer could not load"
          onRetry={() => void offer.refetch()}
        />
      );
    } else {
      content = (
        <View
          style={styles.content}
          testID="offer-loading"
          accessibilityLabel="Loading the offer"
          aria-busy
        >
          <Skeleton height={72} />
          <Skeleton height={200} />
          <SkeletonList rows={3} rowHeight={48} />
        </View>
      );
    }
    return (
      <View style={styles.fill} testID="screen-offer">
        {content}
      </View>
    );
  }

  const current = data;
  const other = current.viewerRole === 'SELLER' ? current.buyer : current.seller;
  const otherName = other.displayName;
  const liveOffer = isLiveOffer(current.status);
  const yourTurn = liveOffer && !current.superseded && current.currentTurn === current.viewerRole;
  const waiting = liveOffer && !current.superseded && current.currentTurn !== current.viewerRole;
  const expiry = expiryLabel(current.expiresAt);
  const round = current.history.filter(
    (event) => event.event === 'CREATED' || event.event === 'COUNTERED'
  ).length;
  const proposer = current.currentTurn === 'SELLER' ? 'BUYER' : 'SELLER';
  const busy = answer.isPending && answer.variables ? ANSWER_ACTION[answer.variables.answer] : null;
  const terms = offerTermsText({
    kind: current.kind,
    cashAmount: current.cashAmount,
    currency: current.currency,
    cards: current.tradeItems,
  });

  const run = async (kind: OfferAnswer, reason?: string) => {
    setNotice(null);
    try {
      await answer.mutateAsync({ offer: current, answer: kind, reason });
      setNotice({
        tone: 'success',
        message:
          kind === 'accept'
            ? `Offer accepted. The trade is open: arrange the exchange with ${otherName}.`
            : kind === 'decline'
              ? `Offer declined. ${otherName} was notified.`
              : `Offer withdrawn. ${otherName} was notified.`,
      });
    } catch (error) {
      if (!isApiError(error)) {
        setNotice({ tone: 'warning', message: 'This could not be done. Please try again.' });
        return;
      }
      const problem = offerProblem(error, otherName);
      setNotice({ tone: 'warning', message: problem.message });
      if (problem.latestOfferId && problem.latestOfferId !== current.id) {
        router.setParams({ id: problem.latestOfferId });
      } else if (problem.reload) {
        void offer.refetch();
      }
    } finally {
      setDialog(null);
    }
  };

  return (
    <View style={styles.fill} testID="screen-offer">
      <Stack.Screen options={{ title: current.item?.card.name ?? 'Offer' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={offer.isRefetching} onRefresh={() => void offer.refetch()} />
        }
      >
        <DealHeader
          eyebrow={`${current.viewerRole === 'SELLER' ? 'Offer from' : 'Your offer to'} ${otherName}`}
          title={current.item?.card.name ?? 'Offer'}
          testID="offer"
        />
        <View style={styles.chips} testID="offer-chips">
          <StatusChip info={offerStatusInfo(current.status)} testID="offer-status" />
          <Pill label={offerKindLabel(current.kind)} testID="offer-kind-pill" />
          {current.protectionRequested ? (
            <Pill label="Payment protection" icon="shield-check-outline" />
          ) : null}
          {round > 1 ? <Pill label={`Round ${round}`} testID="offer-round" /> : null}
          {liveOffer && expiry ? (
            <Pill label={expiry} icon="clock-outline" testID="offer-expiry" />
          ) : null}
        </View>

        {notice ? (
          <DealNotice notice={notice} onDismiss={() => setNotice(null)} testID="offer-notice" />
        ) : null}

        {current.superseded && current.latestOfferId !== current.id ? (
          <Banner
            icon="update"
            text="A newer proposal replaced this one."
            actionLabel="See the latest proposal"
            onAction={() => router.setParams({ id: current.latestOfferId })}
            testID="offer-superseded"
          />
        ) : null}
        {current.tradeId ? (
          <Banner
            icon="handshake"
            tone="success"
            text="Offer accepted: the trade is open."
            actionLabel="Go to the trade"
            onAction={() =>
              router.push({ pathname: '/trades/[id]', params: { id: current.tradeId as string } })
            }
            testID="offer-trade-link"
          />
        ) : null}

        {!current.superseded ? (
          <OfferActionBar
            allowedActions={current.allowedActions}
            busy={busy}
            yourTurn={yourTurn}
            waiting={waiting}
            otherName={otherName}
            messaging={startingId === other.id}
            onAccept={() => setDialog('accept')}
            onCounter={() =>
              router.push({ pathname: '/offers/counter', params: { id: current.id } })
            }
            onDecline={() => setDialog('decline')}
            onWithdraw={() => setDialog('cancel')}
            onMessage={() => void message(other.id)}
          />
        ) : null}

        <Section title="The deal">
          <DealSummary
            item={current.item}
            kind={current.kind}
            cashAmount={current.cashAmount}
            currency={current.currency}
            tradeItems={current.tradeItems}
            message={current.message}
            messageAuthor={nameOf(current, proposer)}
            sellerName={nameOf(current, 'SELLER')}
            buyerName={nameOf(current, 'BUYER')}
          />
        </Section>

        <Section title="Collectors">
          <OfferPartyCard
            role="Seller"
            party={current.seller}
            isYou={current.viewerRole === 'SELLER'}
            testID="offer-seller"
          />
          <OfferPartyCard
            role="Buyer"
            party={current.buyer}
            isYou={current.viewerRole === 'BUYER'}
            testID="offer-buyer"
          />
          <PrivacyNote text="Only approximate areas are shared. Meet in a public place." />
        </Section>

        <Section title="History">
          <OfferHistory
            history={current.history}
            viewerRole={current.viewerRole}
            sellerName={current.seller.displayName}
            buyerName={current.buyer.displayName}
          />
        </Section>
      </ScrollView>

      <ConfirmDialog
        visible={dialog === 'accept'}
        title="Accept this offer?"
        message={`You agree to trade ${current.item?.card.name ?? 'the card'} for ${terms} with ${otherName}. A trade opens where you arrange the exchange; an accepted offer is a commitment.`}
        confirmLabel="Accept offer"
        busy={busy === 'ACCEPT'}
        onConfirm={() => void run('accept')}
        onCancel={() => setDialog(null)}
        testID="accept-dialog"
      />
      <ReasonDialog
        visible={dialog === 'decline'}
        title="Decline this offer?"
        message={`${otherName} will be notified. The negotiation ends; they can make a new offer later.`}
        confirmLabel="Decline offer"
        label="Reason (optional)"
        placeholder="For example: the price is too low for this condition."
        busy={busy === 'DECLINE'}
        onConfirm={(reason) => void run('decline', reason)}
        onCancel={() => setDialog(null)}
        testID="decline-dialog"
      />
      <ReasonDialog
        visible={dialog === 'cancel'}
        title="Withdraw your offer?"
        message={`${otherName} will be notified that you withdrew it.`}
        confirmLabel="Withdraw offer"
        label="Reason (optional)"
        busy={busy === 'CANCEL'}
        onConfirm={(reason) => void run('cancel', reason)}
        onCancel={() => setDialog(null)}
        testID="withdraw-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10], gap: spacing[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], alignItems: 'center' },
});
