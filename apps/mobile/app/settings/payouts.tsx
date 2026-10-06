import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useSellerAccount, useStartOnboarding } from '@/src/api/hooks/payments';
import { Button } from '@/src/components/ui/Button';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { safeAppPath } from '@/src/features/notifications/notificationKinds';
import { StatusChip } from '@/src/features/offers/StatusChip';
import { payoutReturnPath } from '@/src/features/payments/checkoutTargets';
import {
  providerLabel,
  sellerAccountInfo,
  sellerAccountText,
} from '@/src/features/payments/paymentLabels';
import { ProtectionExplainer } from '@/src/features/payments/ProtectionExplainer';
import { formatLongDate } from '@/src/lib/dates';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

const RETURN_PATH = '/settings/payouts';

/**
 * Settings → Payouts (web: `/settings/payouts`; `GET /me/seller-account`,
 * `POST /me/seller-account/onboarding`): the seller onboarding of payment protection. "Set up
 * payouts" continues at the provider's hosted onboarding (the local fake provider activates the
 * account at once and answers this screen's path with `onboarding=complete`). `?returnTo=` offers
 * the way back to the trade that asked for it. Hidden while the `protectedPayments` flag is off
 * (404 `FEATURE_DISABLED` is explained here too).
 */
export default function PayoutSettingsScreen() {
  const { onboarding, returnTo } = useLocalSearchParams<{
    onboarding?: string;
    returnTo?: string;
  }>();
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const account = useSellerAccount();
  const start = useStartOnboarding();
  const [problem, setProblem] = useState<string | null>(null);
  const back = payoutReturnPath(returnTo);

  const begin = async () => {
    setProblem(null);
    const returnUrl = back ? `${RETURN_PATH}?returnTo=${encodeURIComponent(back)}` : RETURN_PATH;
    try {
      const answer = await start.mutateAsync(returnUrl);
      const path = safeAppPath(answer.url);
      if (path) {
        if (answer.account.ready) {
          snackbar.show('Payouts are set up.');
        }
        const [pathname, query = ''] = path.split('?');
        if (pathname === RETURN_PATH) {
          // Back on this screen: show how the setup ended.
          router.setParams(Object.fromEntries(new URLSearchParams(query)));
        } else {
          router.push(path as Href);
        }
      } else if (/^https:\/\//.test(answer.url)) {
        await Linking.openURL(answer.url);
      }
    } catch (error) {
      setProblem(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    }
  };

  let content;
  if (account.error?.errorCode === 'FEATURE_DISABLED') {
    content = (
      <FormMessage tone="info" testID="payouts-disabled">
        Payment protection is not available right now, so there is nothing to set up.
      </FormMessage>
    );
  } else if (account.error && !account.data) {
    content = (
      <ErrorState
        compact
        testID="payouts-error"
        error={account.error}
        title="Your payout account could not load"
        onRetry={() => void account.refetch()}
      />
    );
  } else if (!account.data) {
    content = (
      <View accessibilityLabel="Loading your payout account" aria-busy testID="payouts-loading">
        <SkeletonList rows={3} rowHeight={40} />
      </View>
    );
  } else {
    const data = account.data;
    const info = sellerAccountInfo(data.status);
    const text = sellerAccountText(data.status);
    content = (
      <View style={styles.body}>
        {onboarding === 'complete' && data.ready ? (
          <View
            testID="payouts-complete"
            accessibilityRole="summary"
            style={[styles.done, { backgroundColor: palette.surfaceVariant }]}
          >
            <MaterialCommunityIcons name="party-popper" size={20} color={palette.success} />
            <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
              Payouts are set up. Buyers can now pay you with payment protection.
            </Text>
            {back ? (
              <Button
                label="Back to your trade"
                onPress={() => router.dismissTo(back as Href)}
                testID="payouts-back-to-trade"
              />
            ) : null}
          </View>
        ) : null}
        <View style={styles.status} testID="payout-status">
          <StatusChip info={info} testID="payout-status-chip" />
          <Text style={[textStyle('md'), { color: palette.ink }]}>{text.lead}</Text>
        </View>
        <View style={styles.facts}>
          <Fact label="Payment provider" value={providerLabel(data.provider)} />
          <Fact label="Payouts" value={data.payoutsEnabled ? 'Enabled' : 'Not enabled yet'} />
          {data.updatedAt ? (
            <Fact label="Last update" value={formatLongDate(data.updatedAt)} />
          ) : null}
        </View>
        {data.provider === 'fake' ? (
          <View
            testID="payouts-local"
            style={[
              styles.local,
              { borderColor: palette.warning, backgroundColor: palette.surface },
            ]}
          >
            <MaterialCommunityIcons name="flask-outline" size={18} color={palette.warning} />
            <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
              Local test provider: the setup completes at once and no real money ever moves.
            </Text>
          </View>
        ) : null}
        {problem ? <FormMessage testID="payouts-problem">{problem}</FormMessage> : null}
        {text.action ? (
          <Button
            label={text.action}
            icon="bank-outline"
            loading={start.isPending}
            loadingLabel="Opening…"
            onPress={() => void begin()}
            testID="payouts-start"
          />
        ) : null}
      </View>
    );
  }

  return (
    <Screen scroll safeBottom testID="screen-settings-payouts">
      <SectionCard title="Payouts" description="Where the money of your protected sales goes.">
        {content}
      </SectionCard>
      {account.data ? (
        <View style={styles.explainer}>
          <ProtectionExplainer />
        </View>
      ) : null}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{label}</Text>
      <Text style={[textStyle('sm'), styles.medium, { color: palette.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[3] },
  status: { gap: spacing[2] },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  fact: { minWidth: 140, flexGrow: 1, gap: 2 },
  medium: { fontWeight: fontWeight.medium },
  done: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
  },
  local: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing[3],
  },
  grow: { flex: 1 },
  explainer: { marginTop: spacing[4] },
});
