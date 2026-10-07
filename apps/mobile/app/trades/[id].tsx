import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import { useProtectedStep, type ProtectedVariables } from '@/src/api/hooks/payments';
import { useRatingEligibility } from '@/src/api/hooks/ratings';
import { useTrade, useTradeStep, type TradeStep } from '@/src/api/hooks/trades';
import type { TradeResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import {
  BlockCollectorDialog,
  type BlockTarget,
} from '@/src/features/collectors/BlockCollectorDialog';
import { rateableInteractions } from '@/src/features/collectors/ratingLabels';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { DealNotice, type DealNoticeValue } from '@/src/features/offers/DealNotice';
import { DealHeader, Pill, PrivacyNote, Section } from '@/src/features/offers/DealParts';
import { DealSummary } from '@/src/features/offers/DealSummary';
import { offerKindLabel } from '@/src/features/offers/offerLabels';
import { OfferPartyCard } from '@/src/features/offers/OfferPartyCard';
import { offerProblem } from '@/src/features/offers/offerProblems';
import { ReasonDialog } from '@/src/features/offers/ReasonDialog';
import { StatusChip } from '@/src/features/offers/StatusChip';
import { payTarget } from '@/src/features/payments/checkoutTargets';
import { money } from '@/src/features/payments/paymentLabels';
import { paymentProblem } from '@/src/features/payments/paymentProblems';
import { ratingParams } from '@/src/features/ratings/ratingRoutes';
import { reportParams } from '@/src/features/reports/reportLabels';
import { TradingSafetyNotice } from '@/src/features/safety/TradingSafetyNotice';
import { OpenDisputeDialog, ShipDialog } from '@/src/features/trades/ProtectedDialogs';
import {
  DisputeCard,
  PaymentCard,
  PayoutSetupReminder,
  ShipmentCard,
} from '@/src/features/trades/TradeProtectionCards';
import { nextActionView, tradeStatusInfo } from '@/src/features/trades/tradeLabels';
import { NextActionCard, TradeSteps, TradeTimeline } from '@/src/features/trades/TradeProgress';
import { printingImageUrl } from '@/src/lib/catalog';
import { formatDateTime } from '@/src/lib/dates';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/** The payment-protection steps of a trade (Phase 9, flag `protectedPayments`). */
const PROTECTED_OPERATIONS = ['PAY', 'SHIP', 'CONFIRM_RECEIPT', 'OPEN_DISPUTE'];

function protectedSuccess(step: 'ship' | 'confirm-receipt', trade: TradeResponse): string {
  const other = trade.counterparty.displayName;
  if (step === 'ship') {
    return `Marked as shipped. ${other} was notified and can follow the tracking.`;
  }
  return trade.status === 'COMPLETED'
    ? `Receipt confirmed: the payout was released to ${other}. You can now rate them.`
    : 'Receipt confirmed. The payout is on its way to the seller.';
}

function successMessage(step: TradeStep, trade: TradeResponse): string {
  const other = trade.counterparty.displayName;
  switch (step) {
    case 'meetup':
      return trade.meetup
        ? 'Meetup agreed: you both chose to meet in person.'
        : `Marked as an in-person meetup. ${other} will be asked to agree.`;
    case 'complete':
      return trade.status === 'COMPLETED'
        ? `Trade completed. You can now rate ${other}.`
        : `You confirmed the exchange. Waiting for ${other} to confirm.`;
    default:
      return `Trade cancelled. ${other} was notified.`;
  }
}

/** Cards the viewer received in a completed trade (to add to their own inventory). */
function receivedCards(trade: TradeResponse) {
  if (trade.status !== 'COMPLETED') {
    return [];
  }
  const cards =
    trade.viewerRole === 'BUYER'
      ? [{ item: trade.offer.item, quantity: 1 }]
      : trade.offer.tradeItems.map((line) => ({ item: line.item, quantity: line.quantity }));
  return cards.flatMap((card, index) =>
    card.item
      ? [
          {
            key: `${card.item.id}-${index}`,
            name: card.item.card.name,
            game: card.item.card.game,
            imageUrl: printingImageUrl(card.item.printing),
            printingId: card.item.printing.id ?? null,
            cardId: card.item.card.id,
            quantity: card.quantity,
          },
        ]
      : []
  );
}

/**
 * One trade (the web's `/trades/:id`) for the buyer and the seller: the status, the next move
 * with only the operations the API allows (mark the in-person meetup, confirm the exchange after
 * a confirmation, cancel with a required reason), rate the other collector once it is completed,
 * message them; the progress with both parties' marks, the cards received, the deal with a link
 * to the offer's negotiation, the other collector (place label and distance bucket only), the
 * timeline. With payment protection (Phase 9, flag `protectedPayments`): pay through the
 * provider's checkout (the local fake checkout screen), ship with tracking, confirm receipt,
 * open a dispute within the window, the payment / shipment / dispute cards and a seller's
 * reminder to set up payouts. `?payment=secured|failed` is the checkout screen's answer.
 */
export default function TradeScreen() {
  const { id, payment } = useLocalSearchParams<{ id: string; payment?: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const trade = useTrade(id);
  const step = useTradeStep();
  const protectedStep = useProtectedStep();
  const payments = useFeature(FEATURE.protectedPayments);
  const { message, startingId } = useMessageCollector();
  // A success notice describes the trade as it was answered: it goes once the other collector
  // moved the trade on (live); refusals stay until dismissed.
  const [notice, setNotice] = useState<{ value: DealNoticeValue; status: string } | null>(null);
  const [dialog, setDialog] = useState<
    'complete' | 'cancel' | 'ship' | 'receipt' | 'dispute' | null
  >(null);
  // The checkout screen's answer is told once (state adjusted while rendering).
  const [checkoutTold, setCheckoutTold] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockTarget | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const data = trade.data ?? null;
  const completed = data?.status === 'COMPLETED';
  const eligibility = useRatingEligibility(data?.counterparty.id, completed);

  const checkoutKey = payment === 'secured' || payment === 'failed' ? `${id}:${payment}` : null;
  if (data && checkoutKey && checkoutKey !== checkoutTold) {
    setCheckoutTold(checkoutKey);
    setNotice(
      payment === 'failed'
        ? {
            value: {
              tone: 'warning',
              message: 'The payment did not go through. Nothing was charged: you can try again.',
            },
            status: data.status,
          }
        : {
            value: {
              tone: 'success',
              message: `Payment secured. The payment provider holds it until you confirm receipt; ${data.counterparty.displayName} was asked to ship.`,
            },
            status: 'PAID',
          }
    );
  }

  // Back from the checkout: the notice is at the top.
  useEffect(() => {
    if (checkoutTold) {
      scroll.current?.scrollTo({ y: 0, animated: false });
    }
  }, [checkoutTold]);

  if (!data) {
    let content;
    if (trade.error?.status === 404 || trade.error?.errorCode === 'VALIDATION_FAILED') {
      content = (
        <EmptyState
          testID="trade-not-found"
          icon="handshake-outline"
          title="This trade is not available"
          description="It does not exist, or you are not one of its two collectors."
          actionLabel="My trades"
          onAction={() => router.replace('/trades')}
        />
      );
    } else if (trade.error) {
      content = (
        <ErrorState
          testID="trade-error"
          error={trade.error}
          title="This trade could not load"
          onRetry={() => void trade.refetch()}
        />
      );
    } else {
      content = (
        <View
          style={styles.content}
          testID="trade-loading"
          accessibilityLabel="Loading the trade"
          aria-busy
        >
          <Skeleton height={72} />
          <Skeleton height={120} />
          <SkeletonList rows={3} rowHeight={56} />
        </View>
      );
    }
    return (
      <View style={styles.fill} testID="screen-trade">
        {content}
      </View>
    );
  }

  const current = data;
  const other = current.counterparty;
  const allowed = new Set<string>(current.allowedOperations);
  const busy = step.isPending
    ? (step.variables?.step ?? null)
    : protectedStep.isPending
      ? (protectedStep.variables?.step ?? null)
      : null;
  // The trade screen rates the completed trade (an accepted offer is rated from the profile).
  const rateable = rateableInteractions(eligibility.data).filter(
    (interaction) => interaction.kind === 'TRADE'
  );
  const protectedOps = current.allowedOperations.filter((op) => PROTECTED_OPERATIONS.includes(op));
  // Hidden like every payment entry point while the flag is known to be off (the API refuses
  // these steps with 404 FEATURE_DISABLED anyway).
  const protectionPaused = payments.known && !payments.enabled;
  const canProtect = (op: string) => allowed.has(op) && !protectionPaused;
  const received = receivedCards(current);
  const windowEndsAt = current.payment?.disputeWindowEndsAt
    ? formatDateTime(current.payment.disputeWindowEndsAt)
    : null;
  const view = nextActionView({
    status: current.status,
    nextAction: current.nextAction,
    viewerRole: current.viewerRole,
    other: other.displayName,
    cancelReason: current.cancelReason,
    protectionEnabled: current.protectionEnabled && !current.meetup,
    paymentStatus: current.payment?.status ?? null,
    windowEndsAt,
  });
  const cardName = current.offer.item?.card.name ?? 'the card';
  const amount = money(current.payment?.amount ?? current.cashAmount, current.currency);

  const refused = (error: unknown, wording: 'offer' | 'payment') => {
    if (!isApiError(error)) {
      setNotice({
        value: { tone: 'warning', message: 'This could not be done. Please try again.' },
        status: current.status,
      });
      return;
    }
    const problem =
      wording === 'payment'
        ? paymentProblem(error, other.displayName)
        : offerProblem(error, other.displayName, 'trade');
    setNotice({ value: { tone: 'warning', message: problem.message }, status: current.status });
    if (problem.reload) {
      void trade.refetch();
    }
  };

  const run = async (kind: TradeStep, reason?: string) => {
    setNotice(null);
    try {
      const updated = await step.mutateAsync({ id: current.id, step: kind, reason });
      setNotice({
        value: { tone: 'success', message: successMessage(kind, updated) },
        status: updated.status,
      });
    } catch (error) {
      refused(error, 'offer');
    } finally {
      setDialog(null);
    }
  };

  /** A payment-protection step (Phase 9): refusals are worded by `paymentProblem`. */
  const runProtected = async (variables: ProtectedVariables) => {
    setNotice(null);
    try {
      const answer = await protectedStep.mutateAsync(variables);
      setDialog(null);
      if (answer.step === 'pay') {
        const target = payTarget(answer.payment);
        if (target?.kind === 'app') {
          router.push({ pathname: '/checkout/fake/[ref]', params: { ref: target.ref } });
        } else if (target?.kind === 'external') {
          await Linking.openURL(target.url);
        } else {
          setNotice({
            value: {
              tone: 'warning',
              message:
                'This payment provider’s checkout cannot open here yet. Your payment was not started.',
            },
            status: current.status,
          });
        }
      } else if (answer.step === 'dispute') {
        router.push({
          pathname: '/disputes/[id]',
          params: { id: answer.dispute.id, opened: '1' },
        });
      } else {
        setNotice({
          value: { tone: 'success', message: protectedSuccess(answer.step, answer.trade) },
          status: answer.trade.status,
        });
      }
    } catch (error) {
      setDialog(null);
      refused(error, 'payment');
    }
  };

  return (
    <View style={styles.fill} testID="screen-trade">
      <Stack.Screen options={{ title: current.offer.item?.card.name ?? 'Trade' }} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={trade.isRefetching} onRefresh={() => void trade.refetch()} />
        }
      >
        <DealHeader
          eyebrow={`Trade with ${other.displayName}`}
          title={current.offer.item?.card.name ?? 'Trade'}
          testID="trade"
        />
        <TradingSafetyNotice
          context="trade"
          otherName={other.displayName}
          onReport={() =>
            router.push({
              pathname: '/report',
              params: reportParams(other, { source: 'PROFILE' }),
            })
          }
          onBlock={() => setBlocking({ id: other.id, displayName: other.displayName })}
        />
        <View style={styles.chips}>
          <StatusChip info={tradeStatusInfo(current.status)} testID="trade-status" />
          <Pill label={offerKindLabel(current.kind)} />
          {current.meetup ? (
            <Pill label="In-person meetup" icon="account-group-outline" testID="trade-meetup" />
          ) : null}
          {current.protectionEnabled && !current.meetup ? (
            <Pill label="Payment protection" icon="shield-check-outline" />
          ) : null}
        </View>

        {notice && (notice.value.tone === 'warning' || notice.status === current.status) ? (
          <DealNotice
            notice={notice.value}
            onDismiss={() => setNotice(null)}
            testID="trade-notice"
          />
        ) : null}

        {current.protectionEnabled &&
        current.viewerRole === 'SELLER' &&
        current.status === 'AWAITING_PAYMENT' ? (
          <PayoutSetupReminder tradeId={current.id} buyerName={other.displayName} />
        ) : null}

        <NextActionCard view={view}>
          {canProtect('PAY') ? (
            <Button
              label={`Pay ${amount}`}
              icon="lock-outline"
              loading={busy === 'pay'}
              loadingLabel="Opening the checkout…"
              disabled={!!busy}
              onPress={() => void runProtected({ id: current.id, step: 'pay' })}
              testID="trade-pay"
            />
          ) : null}
          {canProtect('SHIP') ? (
            <Button
              label="Mark as shipped"
              icon="truck-outline"
              loading={busy === 'ship'}
              loadingLabel="Saving…"
              disabled={!!busy}
              onPress={() => setDialog('ship')}
              testID="trade-ship"
            />
          ) : null}
          {canProtect('CONFIRM_RECEIPT') ? (
            <Button
              label="Confirm receipt"
              icon="package-variant-closed"
              loading={busy === 'confirm-receipt'}
              loadingLabel="Confirming…"
              disabled={!!busy}
              onPress={() => setDialog('receipt')}
              testID="trade-confirm-receipt"
            />
          ) : null}
          {canProtect('OPEN_DISPUTE') ? (
            <Button
              label="Open a dispute"
              icon="alert-octagon-outline"
              variant="secondary"
              loading={busy === 'dispute'}
              loadingLabel="Opening…"
              disabled={!!busy}
              onPress={() => setDialog('dispute')}
              testID="trade-open-dispute"
            />
          ) : null}
          {current.dispute ? (
            <Button
              label="View the dispute"
              icon="gavel"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/disputes/[id]',
                  params: { id: current.dispute?.id ?? '' },
                })
              }
              testID="trade-view-dispute"
            />
          ) : null}
          {allowed.has('CONFIRM_COMPLETION') ? (
            <Button
              label="Confirm the exchange"
              icon="check-decagram-outline"
              loading={busy === 'complete'}
              loadingLabel="Confirming…"
              disabled={!!busy}
              onPress={() => setDialog('complete')}
              testID="trade-confirm"
            />
          ) : null}
          {allowed.has('MARK_MEETUP') ? (
            <Button
              label={current.protectionEnabled ? 'Meet in person instead' : 'We meet in person'}
              icon="account-group-outline"
              variant="secondary"
              loading={busy === 'meetup'}
              loadingLabel="Saving…"
              disabled={!!busy}
              onPress={() => void run('meetup')}
              testID="trade-meetup-button"
            />
          ) : null}
          {completed && rateable.length > 0 ? (
            <Button
              label={`Rate ${other.displayName}`}
              icon="star-outline"
              onPress={() =>
                router.push({
                  pathname: '/ratings/rate',
                  params: ratingParams(other, { kind: 'TRADE' }),
                })
              }
              testID="trade-rate"
            />
          ) : null}
          <Button
            label={`Message ${other.displayName}`}
            icon="message-text-outline"
            variant="ghost"
            loading={startingId === other.id}
            loadingLabel="Opening…"
            onPress={() => void message(other.id)}
            testID="trade-message"
          />
        </NextActionCard>

        {protectionPaused && protectedOps.length > 0 ? (
          <FormMessage tone="info" testID="trade-protection-paused">
            Payment protection is not available right now, so paying, shipping and disputes are
            paused. You can still message {other.displayName} or agree to meet in person.
          </FormMessage>
        ) : null}

        <Section title="Progress">
          <TradeSteps trade={current} />
        </Section>

        {current.dispute ? (
          <DisputeCard dispute={current.dispute} currency={current.currency} />
        ) : null}
        {current.payment ? (
          <PaymentCard payment={current.payment} viewerRole={current.viewerRole} />
        ) : null}
        {current.shipment ? <ShipmentCard shipment={current.shipment} /> : null}

        {received.length > 0 ? (
          <Section title="Cards you received" testID="trade-received">
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
              Your inventory is not changed for you: add what you received so collectors nearby can
              find it.
            </Text>
            {received.map((card) => (
              <View key={card.key} style={styles.received}>
                <CardImage src={card.imageUrl} alt="" game={card.game} size="xs" />
                <Text style={[textStyle('sm'), styles.grow, styles.strong, { color: palette.ink }]}>
                  {card.name}
                  {card.quantity > 1 ? ` ×${card.quantity}` : ''}
                </Text>
                <Button
                  label="Add"
                  icon="plus"
                  variant="secondary"
                  accessibilityLabel={`Add ${card.name} to my inventory`}
                  onPress={() =>
                    router.push({
                      pathname: '/items/new',
                      params: card.printingId
                        ? { cardId: card.cardId, printingId: card.printingId }
                        : { cardId: card.cardId },
                    })
                  }
                />
              </View>
            ))}
          </Section>
        ) : null}

        <Section title="The deal">
          <DealSummary
            item={current.offer.item}
            kind={current.kind}
            cashAmount={current.cashAmount}
            currency={current.currency}
            tradeItems={current.offer.tradeItems}
            sellerName={current.viewerRole === 'SELLER' ? 'You' : current.offer.seller.displayName}
            buyerName={current.viewerRole === 'BUYER' ? 'You' : current.offer.buyer.displayName}
          />
          <Button
            label="See the offer and its negotiation"
            icon="history"
            variant="ghost"
            onPress={() =>
              router.push({ pathname: '/offers/[id]', params: { id: current.offer.id } })
            }
            testID="trade-offer-link"
          />
        </Section>

        <Section title="Trading with">
          <OfferPartyCard
            role={current.viewerRole === 'SELLER' ? 'Buyer' : 'Seller'}
            party={other}
            testID="trade-counterparty"
          />
          <PrivacyNote
            text={
              current.protectionEnabled && !current.meetup
                ? 'Ship with tracking and keep photos of the card; check it before you confirm receipt.'
                : 'Meet in a busy public place and check the card before you confirm.'
            }
          />
        </Section>

        <Section title="Timeline">
          <TradeTimeline
            timeline={current.timeline}
            viewerRole={current.viewerRole}
            sellerName={current.offer.seller.displayName}
            buyerName={current.offer.buyer.displayName}
          />
        </Section>

        {allowed.has('CANCEL') ? (
          <Button
            label="Cancel trade"
            icon="cancel"
            variant="ghost"
            loading={busy === 'cancel'}
            loadingLabel="Cancelling…"
            disabled={!!busy}
            onPress={() => setDialog('cancel')}
            testID="trade-cancel"
          />
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={dialog === 'complete'}
        title="Confirm the exchange?"
        message="Confirm only once you exchanged the cards. When both of you confirmed, the trade is completed and the cards leave your inventories."
        confirmLabel="Confirm the exchange"
        busy={busy === 'complete'}
        onConfirm={() => void run('complete')}
        onCancel={() => setDialog(null)}
        testID="complete-dialog"
      />
      <BlockCollectorDialog
        target={blocking}
        onClose={() => setBlocking(null)}
        onBlocked={() => void trade.refetch()}
      />
      <ReasonDialog
        visible={dialog === 'cancel'}
        title="Cancel this trade?"
        message={`${other.displayName} will be notified. Cancelled trades cannot be reopened.`}
        confirmLabel="Cancel trade"
        label="Why are you cancelling?"
        required
        busy={busy === 'cancel'}
        onConfirm={(reason) => void run('cancel', reason)}
        onCancel={() => setDialog(null)}
        testID="cancel-trade-dialog"
      />
      <ConfirmDialog
        visible={dialog === 'receipt'}
        title="Confirm you received the card?"
        message={`Confirm only once the card arrived and matches the listing. The payout (${money(
          current.payment?.sellerAmount,
          current.payment?.currency
        )}) is released to ${other.displayName} and the trade completes; this cannot be undone. If something is wrong, open a dispute instead.`}
        confirmLabel="Confirm receipt"
        busy={busy === 'confirm-receipt'}
        onConfirm={() => void runProtected({ id: current.id, step: 'confirm-receipt' })}
        onCancel={() => setDialog(null)}
        testID="receipt-dialog"
      />
      <ShipDialog
        visible={dialog === 'ship'}
        buyerName={other.displayName}
        cardName={cardName}
        busy={busy === 'ship'}
        onConfirm={(request) => void runProtected({ id: current.id, step: 'ship', request })}
        onCancel={() => setDialog(null)}
      />
      <OpenDisputeDialog
        visible={dialog === 'dispute'}
        sellerName={other.displayName}
        cardName={cardName}
        windowEndsAt={windowEndsAt}
        busy={busy === 'dispute'}
        onConfirm={(request) => void runProtected({ id: current.id, step: 'dispute', request })}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10], gap: spacing[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], alignItems: 'center' },
  received: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
});
