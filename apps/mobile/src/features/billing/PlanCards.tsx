import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { MyEntitlement, MySubscription, Plan } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { StatusChip } from '@/src/features/offers/StatusChip';
import { isEntitling } from '@/src/features/checkout/useProviderCheckout';
import { formatLongDate } from '@/src/lib/dates';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  activeEntitlements,
  amountLabel,
  entitlementLabel,
  entitlementSourceLabel,
  featureLabel,
  formatLimitValue,
  formatPlanPrice,
  humanizeKey,
  isDowngrade,
  subscriptionStatusInfo,
  type UsageRow,
} from './billingLabels';

/**
 * A plan of Premium (web: `app-plan-card`): name, monthly price, description, limits and
 * features, and its action: "Current plan", "Included", "Continue to checkout" for an open
 * checkout, or "Upgrade to …" (disabled while another live subscription blocks a switch).
 */
export function PlanCard({
  plan,
  current,
  highlight,
  busy,
  hasOpenCheckout,
  locked,
  onUpgrade,
  onContinue,
}: {
  plan: Plan;
  current: boolean;
  highlight: boolean;
  busy: boolean;
  hasOpenCheckout: boolean;
  locked: boolean;
  onUpgrade: () => void;
  onContinue: () => void;
}) {
  const { palette } = useTheme();
  const code = plan.code ?? '';
  return (
    <View
      testID={`plan-${code}`}
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: highlight ? palette.primary : palette.border,
          borderWidth: highlight ? 2 : 1,
        },
      ]}
    >
      {current ? (
        <Text
          testID={`plan-${code}-badge`}
          style={[
            styles.badge,
            textStyle('xs'),
            { backgroundColor: palette.accentContainer, color: palette.onAccentContainer },
          ]}
        >
          Your plan
        </Text>
      ) : highlight ? (
        <Text
          style={[
            styles.badge,
            textStyle('xs'),
            { backgroundColor: palette.primaryContainer, color: palette.onPrimaryContainer },
          ]}
        >
          Most popular
        </Text>
      ) : null}
      <Text
        accessibilityRole="header"
        style={[textStyle('xl', 'heading'), styles.strong, { color: palette.ink }]}
      >
        {plan.name}
      </Text>
      <Text
        style={[textStyle('2xl', 'heading'), { color: palette.ink }]}
        testID={`plan-${code}-price`}
      >
        {formatPlanPrice(plan.monthlyPrice, plan.currency, false)}
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}> / month</Text>
      </Text>
      {plan.description ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{plan.description}</Text>
      ) : null}
      <View style={styles.list} accessibilityLabel={`${plan.name} limits and features`}>
        {(plan.limits ?? []).map((limit) => (
          <View key={limit.key} style={styles.item}>
            <MaterialCommunityIcons
              name={limit.limit === null || limit.limit === undefined ? 'infinity' : 'check'}
              size={16}
              color={palette.success}
            />
            <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
              {limit.description || humanizeKey(limit.key ?? '')}
            </Text>
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
              {formatLimitValue(limit.limit)}
            </Text>
          </View>
        ))}
        {(plan.features ?? []).map((feature) => {
          const off = isDowngrade(feature.key, feature.enabled);
          return (
            <View key={feature.key} style={styles.item}>
              <MaterialCommunityIcons
                name={off ? 'minus' : 'check'}
                size={16}
                color={off ? palette.textMuted : palette.success}
              />
              <Text
                style={[
                  textStyle('sm'),
                  styles.grow,
                  { color: off ? palette.textMuted : palette.ink },
                ]}
              >
                {feature.key ? featureLabel(feature.key, !!feature.enabled) : ''}
              </Text>
            </View>
          );
        })}
      </View>
      {current ? (
        <Button label="Current plan" variant="secondary" disabled testID={`plan-${code}-current`} />
      ) : !plan.monthlyPrice ? (
        <Button label="Included" variant="secondary" disabled />
      ) : hasOpenCheckout ? (
        <Button
          label="Continue to checkout"
          icon="cart-arrow-right"
          onPress={onContinue}
          testID={`plan-${code}-continue`}
        />
      ) : (
        <View style={styles.cta}>
          <Button
            label={`Upgrade to ${plan.name}`}
            icon="crown-outline"
            loading={busy}
            loadingLabel="Opening the checkout…"
            disabled={locked}
            onPress={onUpgrade}
            testID={`plan-${code}-upgrade`}
          />
          {locked ? (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              Your current subscription must end before you can switch plans.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** What the live subscription means for the member (web: `SubscriptionCardComponent.text`). */
export function subscriptionText(
  subscription: Pick<MySubscription, 'status' | 'failureCode' | 'cancelAtPeriodEnd'>
): string {
  switch (subscription.status) {
    case 'PENDING':
      return subscription.failureCode
        ? 'Your checkout is still open: the last payment attempt was declined and nothing was charged.'
        : 'Your checkout is still open. Finish paying to start Premium, or close it.';
    case 'TRIAL':
    case 'ACTIVE':
    case 'PAST_DUE':
      return subscription.cancelAtPeriodEnd
        ? 'Cancelled: Premium stays until the end of the paid period, then you are back on the free plan.'
        : 'Premium renews automatically every month. Cancel any time.';
    default:
      return 'This subscription has ended.';
  }
}

/**
 * The member's live subscription (web: `app-subscription-card`): plan, status, price, period and
 * what happens next, with "Cancel at period end" / "Cancel now", or, for an open checkout,
 * "Continue to checkout" / "Close the checkout".
 */
export function SubscriptionCard({
  subscription,
  busy,
  onContinue,
  onCancelAtPeriodEnd,
  onCancelNow,
}: {
  subscription: MySubscription;
  busy: boolean;
  /** Present when the open checkout can be continued in the app. */
  onContinue: (() => void) | null;
  onCancelAtPeriodEnd: () => void;
  onCancelNow: () => void;
}) {
  const { palette } = useTheme();
  const entitling = isEntitling(subscription.status);
  const status = subscriptionStatusInfo(subscription.status);
  return (
    <View
      testID="subscription-card"
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.primary }]}
    >
      <View style={styles.item}>
        <View style={[styles.icon, { backgroundColor: palette.primary }]}>
          <MaterialCommunityIcons name="crown-outline" size={22} color={palette.onPrimary} />
        </View>
        <View style={styles.grow}>
          <Text
            accessibilityRole="header"
            style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
          >
            {subscription.planName ?? subscription.planCode} subscription
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            {amountLabel(subscription.amount, subscription.currency)} / month
          </Text>
        </View>
        <StatusChip info={status} testID="subscription-status" />
      </View>
      <Text style={[textStyle('sm'), { color: palette.ink }]} testID="subscription-text">
        {subscriptionText(subscription)}
      </Text>
      {subscription.status === 'PAST_DUE' ? (
        <Text style={[textStyle('sm'), { color: palette.warning }]}>
          Your last renewal did not go through. Premium stays active while the billing provider
          tries again.
        </Text>
      ) : null}
      <View style={styles.facts}>
        {subscription.activatedAt ? (
          <Fact label="Member since" value={formatLongDate(subscription.activatedAt)} />
        ) : null}
        {subscription.currentPeriodEnd && entitling ? (
          <Fact
            label={subscription.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'}
            value={formatLongDate(subscription.currentPeriodEnd)}
            testID="subscription-period-end"
          />
        ) : null}
        <Fact
          label="Billed by"
          value={
            subscription.provider === 'fake'
              ? 'Local test billing (no real money)'
              : (subscription.provider ?? '—')
          }
        />
      </View>
      {subscription.status === 'PENDING' ? (
        <View style={styles.cta}>
          {onContinue ? (
            <Button
              label="Continue to checkout"
              icon="cart-arrow-right"
              onPress={onContinue}
              testID="subscription-continue"
            />
          ) : null}
          <Button
            label="Close the checkout"
            variant="secondary"
            disabled={busy}
            onPress={onCancelNow}
            testID="subscription-close"
          />
        </View>
      ) : entitling ? (
        <View style={styles.cta}>
          {!subscription.cancelAtPeriodEnd ? (
            <Button
              label="Cancel at period end"
              variant="secondary"
              disabled={busy}
              onPress={onCancelAtPeriodEnd}
              testID="subscription-cancel-end"
            />
          ) : null}
          <Button
            label="Cancel now"
            variant="ghost"
            disabled={busy}
            onPress={onCancelNow}
            testID="subscription-cancel-now"
          />
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.fact} testID={testID} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{label}</Text>
      <Text style={[textStyle('sm'), styles.medium, { color: palette.ink }]}>{value}</Text>
    </View>
  );
}

/** The plan's usage (web: `app-usage-meters`): value, a bar for counters, resets, boosts. */
export function UsageMeters({ rows }: { rows: readonly UsageRow[] }) {
  const { palette } = useTheme();
  return (
    <View style={styles.list} accessibilityLabel="Your plan usage" testID="usage-meters">
      {rows.map((row) => (
        <View key={row.key} style={styles.usage} testID={`usage-${row.key}`}>
          <View style={styles.item}>
            <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
              {row.label}
              {row.boosted ? (
                <Text style={[textStyle('xs'), styles.strong, { color: palette.accent }]}>
                  {' '}
                  · Boosted
                </Text>
              ) : null}
            </Text>
            <Text
              style={[textStyle('sm'), styles.strong, { color: palette.ink }]}
              testID="usage-value"
            >
              {row.value}
            </Text>
          </View>
          {row.percent !== null ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${row.label} used`}
              accessibilityValue={{ min: 0, max: 100, now: row.percent }}
              style={[styles.bar, { backgroundColor: palette.border }]}
            >
              <View
                style={[
                  styles.fill,
                  {
                    width: `${row.percent}%`,
                    backgroundColor: row.full ? palette.warning : palette.primary,
                  },
                ]}
              />
            </View>
          ) : null}
          {row.resetsAt ? (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              Resets {relativeTime(row.resetsAt)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Entitlements still running (web: `app-active-boosts`). */
export function ActiveBoosts({
  entitlements,
  emptyText = 'No active boosts.',
}: {
  entitlements: readonly MyEntitlement[];
  emptyText?: string;
}) {
  const { palette } = useTheme();
  const active = activeEntitlements(entitlements);
  if (active.length === 0) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="boosts-empty">
        {emptyText}
      </Text>
    );
  }
  return (
    <View style={styles.list} accessibilityLabel="Active boosts">
      {active.map((boost) => (
        <View key={boost.id} style={styles.item} testID="active-boost">
          <MaterialCommunityIcons name="lightning-bolt" size={18} color={palette.primary} />
          <View style={styles.grow}>
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
              {entitlementLabel(boost.featureKey, boost.value)}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {entitlementSourceLabel(boost.source)}
              {boost.expiresAt ? ` · ends ${relativeTime(boost.expiresAt)}` : ' · no end date'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing[4], gap: spacing[3], borderWidth: 1 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    fontWeight: fontWeight.semibold,
  },
  strong: { fontWeight: fontWeight.semibold },
  medium: { fontWeight: fontWeight.medium },
  grow: { flex: 1 },
  list: { gap: spacing[2] },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  cta: { gap: spacing[2] },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  fact: { minWidth: 120, flexGrow: 1, gap: 2 },
  usage: { gap: spacing[1] },
  bar: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6 },
});
