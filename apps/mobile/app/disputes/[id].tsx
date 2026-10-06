import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import {
  useAddEvidence,
  useDispute,
  usePostDisputeMessage,
  type EvidenceDraft,
} from '@/src/api/hooks/payments';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { DisputeOverview } from '@/src/features/disputes/DisputeOverview';
import { disputeClosedText, disputeOtherName } from '@/src/features/disputes/disputeRules';
import { DisputeThread, DisputeTimeline } from '@/src/features/disputes/DisputeThread';
import { EvidenceComposer } from '@/src/features/disputes/EvidenceComposer';
import { EvidenceList } from '@/src/features/disputes/EvidenceList';
import { DealNotice, type DealNoticeValue } from '@/src/features/offers/DealNotice';
import { DealHeader, Section } from '@/src/features/offers/DealParts';
import { isOpenDispute } from '@/src/features/payments/paymentLabels';
import { paymentProblem } from '@/src/features/payments/paymentProblems';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * `disputes/[id]` (web: `/disputes/:id`) for the two parties of a protected trade (anybody else
 * gets the not-found state): the dispute with its reason, statuses, decision or hold, evidence
 * (photos from the library and statements can be added while it is open), the thread with the
 * other party and OrenjiTrade, and the timeline. Refusals (409 EVIDENCE_LIMIT_REACHED, a dispute
 * on hold or decided, 413, 415) are explained and the dispute read again. DISPUTE_UPDATE
 * notifications re-read it. `?opened=1`: the buyer just opened it from the trade.
 */
export default function DisputeScreen() {
  const { id, opened } = useLocalSearchParams<{ id: string; opened?: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const dispute = useDispute(id);
  const addEvidence = useAddEvidence(id ?? '');
  const postMessage = usePostDisputeMessage(id ?? '');
  const [notice, setNotice] = useState<DealNoticeValue | null>(null);
  const [openedTold, setOpenedTold] = useState(false);
  const data = dispute.data ?? null;

  if (data && opened === '1' && !openedTold) {
    setOpenedTold(true);
    setNotice({
      tone: 'success',
      message: `Dispute opened. The payout to ${disputeOtherName(data)} is on hold; add photos or a statement below.`,
    });
  }

  if (!data) {
    let content;
    if (dispute.error?.status === 404 || dispute.error?.errorCode === 'VALIDATION_FAILED') {
      content = (
        <EmptyState
          testID="dispute-not-found"
          icon="gavel"
          title="This dispute is not available"
          description="It does not exist, or you are not one of the two collectors of its trade."
          actionLabel="My trades"
          onAction={() => router.replace('/trades')}
        />
      );
    } else if (dispute.error) {
      content = (
        <ErrorState
          testID="dispute-error"
          error={dispute.error}
          title="This dispute could not load"
          onRetry={() => void dispute.refetch()}
        />
      );
    } else {
      content = (
        <View
          style={styles.content}
          testID="dispute-loading"
          accessibilityLabel="Loading the dispute"
          aria-busy
        >
          <Skeleton width="50%" height={32} />
          <Skeleton height={200} />
          <SkeletonList rows={3} rowHeight={56} />
        </View>
      );
    }
    return (
      <View style={styles.fill} testID="screen-dispute">
        {content}
      </View>
    );
  }

  const current = data;
  const other = disputeOtherName(current);
  const names = { BUYER: current.buyer.displayName, SELLER: current.seller.displayName };
  const closedText = disputeClosedText(current);
  const busy = addEvidence.isPending ? 'evidence' : postMessage.isPending ? 'message' : null;

  const refused = (error: unknown) => {
    const message =
      isApiError(error) && error.errorCode === 'INVALID_STATE_TRANSITION'
        ? 'This dispute is on hold or already decided: evidence and messages are closed for now.'
        : isApiError(error)
          ? paymentProblem(error, other).message
          : 'This could not be done. Please try again.';
    setNotice({ tone: 'warning', message });
  };

  const add = async (draft: EvidenceDraft): Promise<boolean> => {
    setNotice(null);
    try {
      await addEvidence.mutateAsync(draft);
      setNotice({
        tone: 'success',
        message: `${draft.kind === 'IMAGE' ? 'Photo' : 'Statement'} added. ${other} and OrenjiTrade can see it.`,
      });
      return true;
    } catch (error) {
      refused(error);
      return false;
    }
  };

  const send = async (text: string): Promise<boolean> => {
    setNotice(null);
    try {
      await postMessage.mutateAsync(text);
      return true;
    } catch (error) {
      refused(error);
      return false;
    }
  };

  return (
    <View style={styles.fill} testID="screen-dispute">
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={dispute.isRefetching}
            onRefresh={() => void dispute.refetch()}
          />
        }
      >
        <Button
          label="Back to the trade"
          icon="arrow-left"
          variant="ghost"
          onPress={() =>
            router.dismissTo({ pathname: '/trades/[id]', params: { id: current.tradeId } })
          }
          style={styles.back}
          testID="dispute-back"
        />
        <DealHeader
          eyebrow={`Dispute with ${other}`}
          title="Payment protection dispute"
          testID="dispute"
        />
        {notice ? (
          <DealNotice notice={notice} onDismiss={() => setNotice(null)} testID="dispute-notice" />
        ) : null}

        <DisputeOverview dispute={current} />

        <Section title={`Evidence (${current.evidence.length})`} testID="dispute-evidence">
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            Photos of the card and the package, receipts or anything that helps an admin understand
            what happened. Everything here is private to you, {other} and OrenjiTrade.
          </Text>
          <EvidenceList
            disputeId={current.id}
            evidence={current.evidence}
            viewer={current.viewerRole}
            names={names}
          />
          {current.canAddEvidence ? (
            <EvidenceComposer
              evidenceLeft={current.evidenceLeft}
              busy={busy === 'evidence'}
              onAdd={add}
            />
          ) : isOpenDispute(current.status) && closedText ? (
            <Text
              style={[textStyle('sm'), { color: palette.textMuted }]}
              testID="dispute-evidence-closed"
            >
              {closedText}
            </Text>
          ) : null}
        </Section>

        <Section title="Messages">
          <DisputeThread
            messages={current.messages}
            viewer={current.viewerRole}
            canPost={current.canPostMessage}
            busy={busy === 'message'}
            label={`Message to ${other} and OrenjiTrade`}
            closedText={closedText}
            onSend={send}
          />
        </Section>

        <Section title="Timeline">
          <DisputeTimeline
            timeline={current.timeline}
            viewer={current.viewerRole}
            names={names}
            currency={current.payment.currency}
          />
        </Section>

        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          An OrenjiTrade admin reviews both sides and decides: a refund to the buyer, the payout to
          the seller, or a split. See the{' '}
          <Text
            accessibilityRole="link"
            onPress={() =>
              router.push({ pathname: '/legal/[key]', params: { key: 'refund-dispute' } })
            }
            style={[styles.link, { color: palette.accent }]}
          >
            Refund and Dispute Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10], gap: spacing[4] },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  link: { textDecorationLine: 'underline', fontWeight: fontWeight.semibold },
});
