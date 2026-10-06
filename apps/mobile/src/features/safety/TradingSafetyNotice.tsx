import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { Button } from '@/src/components/ui/Button';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  useSafetyNoticeStore,
  useSafetyNoticeVisible,
  type SafetyNoticeContext,
} from './safetyNoticeStore';

/** Wording per context (English UI; the linked page exists in English and French). */
const COPY: Record<SafetyNoticeContext, { title: string; text: string }> = {
  conversation: {
    title: 'Trade safely',
    text:
      'Meet in a busy public place in daylight, bring someone along for valuable cards, never ' +
      'share your home address, and check the cards before any money changes hands.',
  },
  trade: {
    title: 'Trade safely',
    text:
      'Meet in a busy public place in daylight, bring someone along for valuable cards, never ' +
      'share your home address, and check the cards before any money changes hands. Be wary of ' +
      'pressure and of requests to pay outside the agreed method.',
  },
};

export interface TradingSafetyNoticeProps {
  context: SafetyNoticeContext;
  /** Display name of the other collector (Report / Block button labels). */
  otherName?: string;
  /** Report the other collector (the parent opens the report screen); hidden when absent. */
  onReport?: () => void;
  /** Block the other collector (the parent confirms); hidden when absent. */
  onBlock?: () => void;
  testID?: string;
}

/**
 * Short, dismissible trading safety reminder shown in a conversation and on the offer / trade
 * screens until the collector dismisses it (per account, per context, on this device; see
 * `safetyNoticeStore`). It never blocks anything: the screen around it keeps working. Links to the
 * "Trading safely" page and offers Report / Block (the parent performs them). Web:
 * `app-trading-safety-notice`.
 */
export function TradingSafetyNotice({
  context,
  otherName = 'this collector',
  onReport,
  onBlock,
  testID = 'safety-notice',
}: TradingSafetyNoticeProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAccount().me?.id ?? null;
  const visible = useSafetyNoticeVisible(userId, context);
  const dismiss = useSafetyNoticeStore((state) => state.dismiss);
  if (!visible || !userId) {
    return null;
  }
  const copy = COPY[context];
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.text}`}
      testID={testID}
      style={[
        styles.notice,
        {
          borderColor: palette.border,
          borderLeftColor: palette.primary,
          backgroundColor: palette.surface,
        },
      ]}
    >
      <MaterialCommunityIcons name="shield-account-outline" size={22} color={palette.primary} />
      <View style={styles.body}>
        <Text style={[textStyle('sm'), styles.title, { color: palette.ink }]}>{copy.title}</Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {copy.text}{' '}
          <Text
            accessibilityRole="link"
            accessibilityLabel="Read our trading safety advice"
            testID={`${testID}-guide`}
            style={[styles.link, { color: palette.accent }]}
            onPress={() =>
              router.push({ pathname: '/legal/[key]', params: { key: 'trading-safely' } })
            }
          >
            Read our trading safety advice
          </Text>
          .
        </Text>
        {onReport || onBlock ? (
          <View style={styles.actions}>
            {onReport ? (
              <Button
                label="Report"
                icon="flag-outline"
                variant="ghost"
                accessibilityLabel={`Report ${otherName}`}
                onPress={onReport}
                testID={`${testID}-report`}
              />
            ) : null}
            {onBlock ? (
              <Button
                label="Block"
                icon="cancel"
                variant="ghost"
                accessibilityLabel={`Block ${otherName}`}
                onPress={onBlock}
                testID={`${testID}-block`}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss the safety notice"
        hitSlop={8}
        onPress={() => dismiss(userId, context)}
        testID={`${testID}-dismiss`}
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
  },
  body: { flex: 1, gap: spacing[1] },
  title: { fontWeight: fontWeight.semibold },
  link: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[1] },
  dismiss: { padding: spacing[1], borderRadius: radius.pill },
  pressed: { opacity: 0.6 },
});
