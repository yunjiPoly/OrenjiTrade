import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { PROTECTION_COPY } from './paymentLabels';

/**
 * How payment protection works, in four steps, with the intermediary disclaimer and a link to the
 * Payment Protection Policy (web: `app-protection-explainer`). `collapsed` starts as a one-line
 * summary that expands ("How it works") — used inside forms; expanded on the checkout and payout
 * screens.
 */
export function ProtectionExplainer({
  collapsed = false,
  testID = 'protection-explainer',
}: {
  collapsed?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(!collapsed);
  return (
    <View
      testID={testID}
      style={[styles.root, { borderColor: palette.success, backgroundColor: palette.surface }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${PROTECTION_COPY.short} How it works`}
        onPress={() => setOpen((value) => !value)}
        style={styles.summary}
        testID={`${testID}-toggle`}
      >
        <MaterialCommunityIcons name="shield-check-outline" size={20} color={palette.success} />
        <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
          {PROTECTION_COPY.short}
        </Text>
        <Text style={[textStyle('xs'), styles.more, { color: palette.accent }]}>
          {open ? 'Hide' : 'How it works'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.body} testID={`${testID}-steps`}>
          {PROTECTION_COPY.steps.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={[styles.num, { backgroundColor: palette.success }]}>
                <Text style={[textStyle('xs'), styles.numText]}>{index + 1}</Text>
              </View>
              <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>{step}</Text>
            </View>
          ))}
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {PROTECTION_COPY.intermediary}{' '}
            <Text
              accessibilityRole="link"
              onPress={() =>
                router.push({ pathname: '/legal/[key]', params: { key: 'payment-protection' } })
              }
              style={[styles.link, { color: palette.accent }]}
              testID={`${testID}-policy`}
            >
              Payment Protection Policy
            </Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, borderRadius: radius.md },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    minHeight: 44,
  },
  grow: { flex: 1 },
  more: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
  body: { gap: spacing[2], paddingHorizontal: spacing[3], paddingBottom: spacing[3] },
  step: { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  num: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { color: '#FFFFFF', fontWeight: fontWeight.semibold },
  link: { textDecorationLine: 'underline', fontWeight: fontWeight.semibold },
});
