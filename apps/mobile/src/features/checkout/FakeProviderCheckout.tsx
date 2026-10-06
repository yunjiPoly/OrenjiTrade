import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import type { IconName } from '@/src/components/ui/EmptyState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Skeleton } from '@/src/components/ui/Skeleton';
import type { StatusInfo } from '@/src/features/offers/offerLabels';
import { StatusChip } from '@/src/features/offers/StatusChip';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import type { CheckoutOutcome, CheckoutStatus } from './useProviderCheckout';

export interface FakeProviderCheckoutProps {
  status: CheckoutStatus;
  outcome: CheckoutOutcome | null;
  eyebrow: string;
  icon: IconName;
  heading: string;
  summary?: string | null;
  amount: string;
  /** Suffix of the amount ("per month"). */
  per?: string | null;
  statusInfo: StatusInfo;
  payLabel: string;
  /** Shown above the buttons (a declined earlier attempt). */
  note?: string | null;
  problem?: string | null;
  doneText: string;
  doneLabel: string;
  onDone: () => void;
  backLabel: string;
  onBack: () => void;
  /** A declined attempt leaves the checkout open ("Try again"). */
  retryable?: boolean;
  onPay: () => void;
  onDecline: () => void;
  onTryAgain?: () => void;
  children?: ReactNode;
}

/** The "Local test payment" banner of every fake provider checkout. */
export function LocalPaymentBanner() {
  const { palette } = useTheme();
  return (
    <View
      testID="local-payment-banner"
      accessibilityRole="text"
      style={[styles.banner, { borderColor: palette.warning, backgroundColor: palette.surface }]}
    >
      <MaterialCommunityIcons name="flask-outline" size={20} color={palette.warning} />
      <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
        <Text style={styles.strong}>Local test payment. </Text>
        This page stands in for the payment provider on a development machine: no card is asked for
        and no real money moves.
      </Text>
    </View>
  );
}

/**
 * The card of a local fake provider checkout (web: `app-fake-provider-checkout` and the fake
 * payment checkout page): what is paid, its status, "Pay" / "Simulate a failed payment", the
 * wait for the provider and how it ended. The screen owns the state and the navigation.
 */
export function FakeProviderCheckout({
  status,
  outcome,
  eyebrow,
  icon,
  heading,
  summary,
  amount,
  per,
  statusInfo,
  payLabel,
  note,
  problem,
  doneText,
  doneLabel,
  onDone,
  backLabel,
  onBack,
  retryable = false,
  onPay,
  onDecline,
  onTryAgain,
  children,
}: FakeProviderCheckoutProps) {
  const { palette } = useTheme();
  if (status === 'loading') {
    return (
      <View style={styles.root}>
        <LocalPaymentBanner />
        <View
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          testID="checkout-loading"
          accessibilityLabel="Loading the checkout"
          aria-busy
        >
          <Skeleton width="40%" height={18} />
          <Skeleton width="70%" height={26} />
          <Skeleton height={48} />
        </View>
      </View>
    );
  }
  const failedOpen = retryable && outcome === 'failed';
  return (
    <View style={styles.root}>
      <LocalPaymentBanner />
      <View
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        testID="checkout-card"
      >
        <View style={styles.row}>
          <MaterialCommunityIcons name={icon} size={18} color={palette.textMuted} />
          <Text style={[textStyle('sm'), styles.strong, { color: palette.textMuted }]}>
            {eyebrow}
          </Text>
        </View>
        <Text
          accessibilityRole="header"
          testID="checkout-heading"
          style={[textStyle('xl', 'heading'), styles.strong, { color: palette.ink }]}
        >
          {heading}
        </Text>
        {summary ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="checkout-summary">
            {summary}
          </Text>
        ) : null}
        <Text
          testID="checkout-amount"
          style={[textStyle('3xl', 'heading'), { color: palette.ink }]}
        >
          {amount}
          {per ? <Text style={[textStyle('sm'), { color: palette.textMuted }]}> {per}</Text> : null}
        </Text>
        <StatusChip info={statusInfo} testID="checkout-status" />
        {problem ? <FormMessage testID="checkout-problem">{problem}</FormMessage> : null}

        {status === 'ready' ? (
          <View style={styles.actions}>
            {note ? (
              <FormMessage tone="info" testID="checkout-note">
                {note}
              </FormMessage>
            ) : null}
            <Button label={payLabel} icon="lock-outline" onPress={onPay} testID="checkout-pay" />
            <Button
              label="Simulate a failed payment"
              variant="secondary"
              onPress={onDecline}
              testID="checkout-decline"
            />
          </View>
        ) : null}
        {status === 'processing' ? (
          <View
            style={styles.row}
            accessibilityLiveRegion="polite"
            testID="checkout-waiting"
            accessible
            accessibilityLabel="Waiting for the payment provider…"
          >
            <ActivityIndicator color={palette.primary} />
            <Text style={[textStyle('sm'), { color: palette.ink }]}>
              Waiting for the payment provider…
            </Text>
          </View>
        ) : null}
        {status === 'done' ? (
          <View style={styles.actions}>
            <View
              style={styles.row}
              accessibilityLiveRegion="polite"
              testID="checkout-outcome"
              accessible
              accessibilityLabel={doneText}
            >
              <MaterialCommunityIcons
                name={
                  outcome === 'succeeded'
                    ? 'check-circle-outline'
                    : outcome === 'pending'
                      ? 'clock-outline'
                      : 'alert-circle-outline'
                }
                size={20}
                color={outcome === 'succeeded' ? palette.success : palette.warning}
              />
              <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>{doneText}</Text>
            </View>
            {failedOpen && onTryAgain ? (
              <Button label="Try again" onPress={onTryAgain} testID="checkout-try-again" />
            ) : null}
            <Button
              label={doneLabel}
              variant={failedOpen ? 'secondary' : 'primary'}
              onPress={onDone}
              testID="checkout-done"
            />
          </View>
        ) : null}
        {status !== 'done' ? (
          <Button
            label={backLabel}
            icon="arrow-left"
            variant="ghost"
            onPress={onBack}
            disabled={status === 'processing'}
            testID="checkout-back"
          />
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  banner: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing[3],
  },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing[4], gap: spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  actions: { gap: spacing[2] },
});
