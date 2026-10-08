import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { Dispute } from '@/src/api/types';
import { StatusChip } from '@/src/features/offers/StatusChip';
import {
  disputeReasonLabel,
  disputeStatusInfo,
  isOpenDispute,
  money,
  paymentStatusInfo,
} from '@/src/features/payments/paymentLabels';
import { formatDateTime } from '@/src/lib/dates';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface DisputeFact {
  key: string;
  label: string;
  value: string;
}

/**
 * The facts of a dispute (web: `DisputeOverviewComponent.facts`): both parties by name and
 * handle only, what was paid, refunded and paid out, and the shipment.
 */
export function disputeFacts(dispute: Dispute): DisputeFact[] {
  const viewer = dispute.viewerRole;
  const payment = dispute.payment;
  const who = (role: 'BUYER' | 'SELLER', party: { displayName: string; handle: string }) =>
    `${party.displayName} (@${party.handle})${viewer === role ? ' · you' : ''}`;
  const facts: DisputeFact[] = [
    { key: 'buyer', label: 'Buyer', value: who('BUYER', dispute.buyer) },
    { key: 'seller', label: 'Seller', value: who('SELLER', dispute.seller) },
    { key: 'paid', label: 'Paid', value: money(payment.amount, payment.currency) },
  ];
  if (payment.refundedAmount > 0) {
    facts.push({
      key: 'refunded',
      label: 'Refunded',
      value: money(payment.refundedAmount, payment.currency),
    });
  }
  facts.push({
    key: 'payout',
    label: 'Payout',
    value:
      payment.payoutAmount !== null && payment.payoutAmount !== undefined
        ? `${money(payment.payoutAmount, payment.currency)} released`
        : payment.payoutFrozen
          ? 'On hold'
          : 'Not released',
  });
  const shipment = dispute.shipment;
  if (shipment) {
    facts.push({ key: 'carrier', label: 'Carrier', value: shipment.carrier || 'Not given' });
    facts.push({
      key: 'tracking',
      label: 'Tracking',
      value: shipment.trackingNumber || 'Not given',
    });
  } else {
    facts.push({ key: 'shipment', label: 'Shipment', value: 'Not shipped' });
  }
  return facts;
}

/**
 * The head of a dispute (web: `app-dispute-overview`): the trade summary, the reason, the dispute
 * and payment statuses, the buyer's description, the decision (refund, note) or the hold, and
 * the facts.
 */
export function DisputeOverview({ dispute }: { dispute: Dispute }) {
  const { palette } = useTheme();
  const open = isOpenDispute(dispute.status);
  const resolved = !open && !!dispute.resolvedAt;
  const status = disputeStatusInfo(dispute.status);
  return (
    <View
      testID="dispute-overview"
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{dispute.summary}</Text>
      <Text
        accessibilityRole="header"
        testID="dispute-reason"
        style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
      >
        {disputeReasonLabel(dispute.reason)}
      </Text>
      <View style={styles.chips} testID="dispute-chips">
        <StatusChip info={status} testID="dispute-status" />
        <StatusChip info={paymentStatusInfo(dispute.payment.status)} testID="dispute-payment" />
      </View>
      <View style={[styles.quote, { borderColor: palette.borderStrong }]}>
        <Text style={[textStyle('sm'), { color: palette.ink }]} testID="dispute-description">
          {dispute.description}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {dispute.viewerRole === 'BUYER' ? 'You' : dispute.buyer.displayName} · opened{' '}
          {formatDateTime(dispute.openedAt)}
        </Text>
      </View>
      {resolved ? (
        <View
          testID="dispute-decision"
          accessibilityRole="summary"
          style={[styles.note, { backgroundColor: palette.surfaceVariant }]}
        >
          <MaterialCommunityIcons name="scale-balance" size={20} color={palette.success} />
          <View style={styles.grow}>
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
              {status.label}
            </Text>
            {dispute.refundAmount ? (
              <Text style={[textStyle('sm'), { color: palette.ink }]}>
                Refund to the buyer: {money(dispute.refundAmount, dispute.payment.currency)}
              </Text>
            ) : null}
            {dispute.resolutionNote ? (
              <Text style={[textStyle('sm'), styles.italic, { color: palette.textMuted }]}>
                “{dispute.resolutionNote}”
              </Text>
            ) : null}
          </View>
        </View>
      ) : dispute.status === 'FROZEN' ? (
        <View
          testID="dispute-hold"
          style={[styles.note, { backgroundColor: palette.surfaceVariant }]}
        >
          <MaterialCommunityIcons name="snowflake" size={20} color={palette.danger} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            OrenjiTrade put this dispute on hold while it checks the case. Evidence and messages are
            paused; the payout stays on hold.
          </Text>
        </View>
      ) : open && dispute.payment.payoutFrozen ? (
        <View
          testID="dispute-payout-hold"
          style={[styles.note, { backgroundColor: palette.surfaceVariant }]}
        >
          <MaterialCommunityIcons name="pause-circle-outline" size={20} color={palette.info} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            The payout is on hold until an OrenjiTrade admin decides.
          </Text>
        </View>
      ) : null}
      <View style={styles.facts}>
        {disputeFacts(dispute).map((fact) => (
          <View
            key={fact.key}
            style={styles.fact}
            testID={`dispute-fact-${fact.key}`}
            accessible
            accessibilityLabel={`${fact.label}: ${fact.value}`}
          >
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{fact.label}</Text>
            <Text style={[textStyle('sm'), styles.medium, { color: palette.ink }]}>
              {fact.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing[4], gap: spacing[3] },
  strong: { fontWeight: fontWeight.semibold },
  medium: { fontWeight: fontWeight.medium },
  italic: { fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  quote: { borderLeftWidth: 3, paddingLeft: spacing[3], gap: spacing[1] },
  note: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
    borderRadius: radius.md,
    padding: spacing[3],
  },
  grow: { flex: 1, gap: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  fact: { minWidth: 140, flexGrow: 1, gap: 2 },
});
