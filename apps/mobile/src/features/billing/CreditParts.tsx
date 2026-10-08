import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import type { CreditEntry, CreditProduct, MyReferral } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { FormDialog } from '@/src/components/ui/FormDialog';
import { TextField } from '@/src/components/ui/TextField';
import { formatDateTime, formatLongDate } from '@/src/lib/dates';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  CREDITS_NOT_CASH,
  PRODUCT_ICONS,
  creditReasonLabel,
  creditTypeLabel,
  creditsLabel,
  durationLabel,
  referralCodeError,
  signedCredits,
} from './billingLabels';

/** The balance (web: `app-credit-balance`) with the "not money" sentence. */
export function CreditBalance({ balance }: { balance: number }) {
  const { palette } = useTheme();
  return (
    <View
      testID="credit-balance-card"
      style={[
        styles.card,
        styles.row,
        { backgroundColor: palette.primaryContainer, borderColor: palette.primary },
      ]}
    >
      <MaterialCommunityIcons
        name="hand-coin-outline"
        size={32}
        color={palette.onPrimaryContainer}
      />
      <View style={styles.grow}>
        <Text
          accessibilityRole="header"
          style={[textStyle('sm'), { color: palette.onPrimaryContainer }]}
        >
          Your balance
        </Text>
        <Text
          testID="credit-balance"
          accessibilityLiveRegion="polite"
          style={[textStyle('3xl', 'heading'), { color: palette.onPrimaryContainer }]}
        >
          {balance.toLocaleString('en-CA')}
          <Text style={textStyle('md')}> {balance === 1 ? 'credit' : 'credits'}</Text>
        </Text>
        <Text style={[textStyle('xs'), { color: palette.onPrimaryContainer }]}>
          {CREDITS_NOT_CASH}
        </Text>
      </View>
    </View>
  );
}

/** What credits unlock (web: `app-credit-products`), each with its cost and duration. */
export function CreditProducts({
  products,
  balance,
  onUnlock,
}: {
  products: readonly CreditProduct[];
  balance: number;
  onUnlock: (product: CreditProduct) => void;
}) {
  const { palette } = useTheme();
  if (products.length === 0) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="products-empty">
        Nothing can be unlocked with credits right now.
      </Text>
    );
  }
  return (
    <View style={styles.list} accessibilityLabel="Features you can unlock">
      {products.map((product) => {
        const cost = product.cost ?? 0;
        const short = cost > balance;
        return (
          <View
            key={product.key}
            testID={`product-${product.key}`}
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <View style={styles.row}>
              <MaterialCommunityIcons
                name={PRODUCT_ICONS[product.featureKey ?? ''] ?? 'lightning-bolt'}
                size={22}
                color={palette.primary}
              />
              <Text style={[textStyle('md'), styles.strong, styles.grow, { color: palette.ink }]}>
                {product.name}
              </Text>
            </View>
            {product.description ? (
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                {product.description}
              </Text>
            ) : null}
            <Text style={[textStyle('sm'), { color: palette.ink }]}>
              {creditsLabel(cost)} · {durationLabel(product.durationHours)}
            </Text>
            <Button
              label={`Unlock for ${creditsLabel(cost)}`}
              disabled={short}
              onPress={() => onUnlock(product)}
              testID={`product-${product.key}-unlock`}
            />
            {short ? (
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                You need {creditsLabel(cost - balance)} more.
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * "Unlock …?" (web: `SpendCreditsDialogComponent`): cost, balance after, duration, the "not
 * money" sentence and the refusal (409 INSUFFICIENT_CREDITS with the balance and the cost).
 */
export function SpendDialog({
  product,
  balance,
  busy,
  problem,
  onConfirm,
  onCancel,
}: {
  product: CreditProduct | null;
  balance: number;
  busy: boolean;
  problem: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { palette } = useTheme();
  const cost = product?.cost ?? 0;
  return (
    <FormDialog
      visible={!!product}
      title={`Unlock ${product?.name ?? ''}?`}
      message={product?.description ?? undefined}
      confirmLabel={`Unlock for ${creditsLabel(cost)}`}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
      testID="spend-dialog"
    >
      <View style={styles.list}>
        <Fact label="Cost" value={creditsLabel(cost)} testID="spend-cost" />
        <Fact label="Balance after" value={creditsLabel(balance - cost)} />
        <Fact label="Lasts" value={durationLabel(product?.durationHours)} />
      </View>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        Starts now, or right after an active unlock of the same feature. {CREDITS_NOT_CASH}
      </Text>
      {problem ? <FormMessage testID="spend-problem">{problem}</FormMessage> : null}
    </FormDialog>
  );
}

function Fact({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.fact} testID={testID} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>{value}</Text>
    </View>
  );
}

/**
 * The member's referral code with the rewards for both sides and "Share", and the form to
 * redeem another member's code once, shortly after joining (web: `app-referral-card`).
 */
export function ReferralCard({
  referral,
  redeeming,
  error,
  onRedeem,
}: {
  referral: MyReferral;
  redeeming: boolean;
  /** The refusal of the last redemption (shown on the field). */
  error: string | null;
  onRedeem: (code: string) => void;
}) {
  const { palette } = useTheme();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const fieldError = (touched ? referralCodeError(code) : null) ?? error;
  const share = async () => {
    try {
      await Share.share({
        message: `Join me on OrenjiTrade, the map of card collectors in your region. Use my referral code ${referral.code} to get ${creditsLabel(referral.refereeReward)}.`,
      });
    } catch {
      // The member closed the share sheet.
    }
  };
  return (
    <View style={styles.list}>
      <View
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <Text
          accessibilityRole="header"
          style={[textStyle('md'), styles.strong, { color: palette.ink }]}
        >
          Invite a collector
        </Text>
        <Text style={[textStyle('sm'), { color: palette.ink }]}>
          When a new collector redeems your code, they get {creditsLabel(referral.refereeReward)}{' '}
          and you get {creditsLabel(referral.referrerReward)}.
        </Text>
        <Text
          selectable
          testID="referral-code"
          style={[
            styles.code,
            textStyle('lg'),
            {
              color: palette.ink,
              backgroundColor: palette.surfaceVariant,
              fontFamily: fontFamily.mono,
            },
          ]}
        >
          {referral.code}
        </Text>
        <Button
          label="Share"
          icon="share-variant"
          variant="secondary"
          onPress={() => void share()}
          testID="referral-share"
        />
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          Redeemed {referral.redemptions ?? 0} {referral.redemptions === 1 ? 'time' : 'times'} so
          far.
        </Text>
      </View>
      <View
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <Text
          accessibilityRole="header"
          style={[textStyle('md'), styles.strong, { color: palette.ink }]}
        >
          Got a code?
        </Text>
        {referral.redeemed ? (
          <Text style={[textStyle('sm'), { color: palette.ink }]} testID="referral-redeemed">
            You already redeemed a referral code. Thanks for joining through a friend!
          </Text>
        ) : referral.canRedeem === false ? (
          <Text style={[textStyle('sm'), { color: palette.ink }]} testID="referral-closed">
            Referral codes can only be redeemed shortly after joining, and that window has closed.
          </Text>
        ) : (
          <View style={styles.list}>
            <TextField
              label="Referral code"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect={false}
              maxLength={32}
              error={fieldError}
              hint={
                referral.redeemBefore
                  ? `Redeem before ${formatLongDate(referral.redeemBefore)}.`
                  : undefined
              }
              editable={!redeeming}
              testID="referral-input"
            />
            <Button
              label="Redeem"
              loading={redeeming}
              loadingLabel="Redeeming…"
              onPress={() => {
                setTouched(true);
                if (!referralCodeError(code)) {
                  onRedeem(code.trim());
                }
              }}
              testID="referral-redeem"
            />
          </View>
        )}
      </View>
    </View>
  );
}

/** The append-only credit history (web: `app-credit-ledger`), newest first. */
export function CreditLedger({
  entries,
  productNames,
}: {
  entries: readonly CreditEntry[];
  productNames: Record<string, string>;
}) {
  const { palette } = useTheme();
  if (entries.length === 0) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="ledger-empty">
        No credits yet. Invite a collector with your referral code to earn your first ones.
      </Text>
    );
  }
  return (
    <View style={styles.list} accessibilityLabel="Credit history">
      {entries.map((entry) => {
        const minus = (entry.amount ?? 0) < 0;
        return (
          <View key={entry.id} style={styles.row} testID="ledger-entry">
            <View
              style={[
                styles.sign,
                { backgroundColor: minus ? palette.surfaceVariant : palette.accentContainer },
              ]}
            >
              <MaterialCommunityIcons
                name={minus ? 'minus' : 'plus'}
                size={16}
                color={minus ? palette.textMuted : palette.onAccentContainer}
              />
            </View>
            <View style={styles.grow}>
              <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
                {creditReasonLabel(entry.reason, productNames[entry.product ?? ''] ?? null)}
              </Text>
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                {creditTypeLabel(entry.type)} · {formatDateTime(entry.createdAt)}
                {entry.expiresAt ? ` · unlocked until ${formatDateTime(entry.expiresAt)}` : ''}
              </Text>
            </View>
            <View style={styles.amounts}>
              <Text
                testID="ledger-amount"
                style={[
                  textStyle('md'),
                  styles.strong,
                  { color: minus ? palette.ink : palette.success },
                ]}
              >
                {signedCredits(entry.amount)}
              </Text>
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                Balance {entry.balanceAfter ?? '—'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  list: { gap: spacing[3] },
  fact: { flexDirection: 'row', gap: spacing[3] },
  code: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.sm,
    letterSpacing: 1,
  },
  sign: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  amounts: { alignItems: 'flex-end', gap: 2 },
});
