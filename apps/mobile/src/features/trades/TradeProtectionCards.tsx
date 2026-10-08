import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import { useSellerAccount } from '@/src/api/hooks/payments';
import type { DisputeSummary, PaymentSummary, ShipmentSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import type { IconName } from '@/src/components/ui/EmptyState';
import type { StatusInfo } from '@/src/features/offers/offerLabels';
import { StatusChip } from '@/src/features/offers/StatusChip';
import {
  disputeReasonLabel,
  disputeStatusInfo,
  money,
  paymentRows,
  paymentStatusInfo,
  providerLabel,
} from '@/src/features/payments/paymentLabels';
import { ProtectionExplainer } from '@/src/features/payments/ProtectionExplainer';
import { formatDateTime } from '@/src/lib/dates';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

function Card({
  title,
  icon,
  status,
  children,
  testID,
}: {
  title: string;
  icon: IconName;
  status?: StatusInfo;
  children: ReactNode;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons name={icon} size={20} color={palette.textMuted} />
        <Text
          accessibilityRole="header"
          style={[textStyle('md'), styles.strong, styles.grow, { color: palette.ink }]}
        >
          {title}
        </Text>
        {status ? <StatusChip info={status} testID={`${testID}-status`} /> : null}
      </View>
      {children}
    </View>
  );
}

function Fact({
  label,
  value,
  strong,
  testID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.fact} testID={testID} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[textStyle('sm'), strong && styles.strong, { color: palette.ink }]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * The protected payment of a trade (web: `app-trade-payment-card`): its status, what the buyer
 * pays, the platform fee taken from the payout, refunds and the payout, the dispute window or
 * the hold, the provider, and how payment protection works.
 */
export function PaymentCard({
  payment,
  viewerRole,
}: {
  payment: PaymentSummary;
  viewerRole: string;
}) {
  const { palette } = useTheme();
  const rows = paymentRows(payment, viewerRole);
  return (
    <Card
      title="Payment protection"
      icon="shield-check-outline"
      status={paymentStatusInfo(payment.status)}
      testID="payment-card"
    >
      {rows.map((row) => (
        <Fact
          key={row.key}
          label={row.label}
          value={row.value}
          strong={row.strong}
          testID={`payment-${row.key}`}
        />
      ))}
      {payment.payoutFrozen ? (
        <Text style={[textStyle('sm'), { color: palette.ink }]} testID="payment-hold">
          The payout is on hold while a dispute is reviewed.
        </Text>
      ) : payment.disputeWindowEndsAt && !payment.payoutReleasedAt && !payment.refundedAt ? (
        <Text style={[textStyle('sm'), { color: palette.ink }]} testID="payment-window">
          Dispute window ends {formatDateTime(payment.disputeWindowEndsAt)}
        </Text>
      ) : null}
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        Processed by {providerLabel(payment.provider)}. OrenjiTrade never sees card details.
      </Text>
      <ProtectionExplainer collapsed testID="payment-explainer" />
    </Card>
  );
}

/** The shipment of a protected trade (web: `app-trade-shipment-card`). */
export function ShipmentCard({ shipment }: { shipment: ShipmentSummary }) {
  const { palette } = useTheme();
  return (
    <Card title="Shipment" icon="truck-outline" testID="shipment-card">
      <Fact label="Shipped" value={formatDateTime(shipment.shippedAt)} />
      <Fact label="Carrier" value={shipment.carrier || 'Not given'} />
      <Fact
        label="Tracking number"
        value={shipment.trackingNumber || 'Not given'}
        testID="shipment-tracking"
      />
      {shipment.deliveredAt ? (
        <Fact label="Delivered" value={formatDateTime(shipment.deliveredAt)} />
      ) : null}
      {shipment.sellerNotes ? (
        <Text style={[textStyle('sm'), styles.quote, { color: palette.textMuted }]}>
          “{shipment.sellerNotes}”
        </Text>
      ) : null}
    </Card>
  );
}

/** The dispute of a protected trade (web: `app-trade-dispute-card`), with a link to it. */
export function DisputeCard({
  dispute,
  currency,
}: {
  dispute: DisputeSummary;
  currency: string | null | undefined;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <Card
      title="Dispute"
      icon="gavel"
      status={disputeStatusInfo(dispute.status)}
      testID="dispute-card"
    >
      <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
        {disputeReasonLabel(dispute.reason)}
      </Text>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        Opened {formatDateTime(dispute.openedAt)}
        {dispute.resolvedAt ? ` · decided ${formatDateTime(dispute.resolvedAt)}` : ''}
      </Text>
      {dispute.refundAmount ? (
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          Refund: {money(dispute.refundAmount, currency)}
        </Text>
      ) : null}
      <Button
        label="View the dispute"
        icon="open-in-new"
        variant="secondary"
        onPress={() => router.push({ pathname: '/disputes/[id]', params: { id: dispute.id } })}
        testID="dispute-card-open"
      />
    </Card>
  );
}

/**
 * A seller's reminder on a protected trade that waits for the payment (web:
 * `app-trade-payout-setup`): the buyer can only pay once the payout account is ready (409
 * SELLER_NOT_ONBOARDED otherwise). Links to Settings → Payouts, which brings the seller back.
 */
export function PayoutSetupReminder({
  tradeId,
  buyerName,
}: {
  tradeId: string;
  buyerName: string;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const payments = useFeature(FEATURE.protectedPayments);
  const account = useSellerAccount(payments.enabled);
  if (!payments.enabled || !account.data || account.data.ready) {
    return null;
  }
  return (
    <View
      testID="payout-setup"
      style={[
        styles.card,
        { backgroundColor: palette.accentContainer, borderColor: palette.accent },
      ]}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons name="bank-outline" size={20} color={palette.onAccentContainer} />
        <Text
          accessibilityRole="header"
          style={[
            textStyle('md'),
            styles.strong,
            styles.grow,
            { color: palette.onAccentContainer },
          ]}
        >
          Set up payouts to get paid
        </Text>
      </View>
      <Text style={[textStyle('sm'), { color: palette.onAccentContainer }]}>
        {buyerName} can pay with payment protection as soon as your payout account is ready. The
        payment provider handles it: OrenjiTrade never sees your bank details.
      </Text>
      <Button
        label="Set up payouts"
        icon="bank-outline"
        onPress={() =>
          router.push({ pathname: '/settings/payouts', params: { returnTo: `/trades/${tradeId}` } })
        }
        testID="payout-setup-open"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  fact: { flexDirection: 'row', gap: spacing[3], alignItems: 'baseline' },
  quote: { fontStyle: 'italic' },
});
