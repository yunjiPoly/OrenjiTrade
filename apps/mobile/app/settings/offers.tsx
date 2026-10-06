import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { useOfferSettings, useUpdateOfferSettings } from '@/src/api/hooks/offers';
import type { OfferSettings } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { SwitchRow } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Settings → Offers (the web's `/settings/offers`, `GET/PUT /me/settings/offers`): whether
 * collectors may offer cash together with cards on the caller's TRADE_OR_SALE cards. Saved at
 * once; a failure restores the switch.
 */
export default function OfferSettingsScreen() {
  const settings = useOfferSettings();
  return (
    <Screen scroll safeBottom testID="screen-settings-offers">
      <QueryState
        query={settings}
        errorTitle="Your offer settings could not load"
        loading={<SkeletonList rows={2} rowHeight={56} />}
        testID="settings-offers"
      >
        {(data) => <OfferSettingsForm initial={data} />}
      </QueryState>
    </Screen>
  );
}

function OfferSettingsForm({ initial }: { initial: OfferSettings }) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const save = useUpdateOfferSettings();
  const [acceptsMixed, setAcceptsMixed] = useState(initial.acceptsMixed);
  const [saved, setSaved] = useState(false);

  const toggle = async (value: boolean) => {
    const before = acceptsMixed;
    setAcceptsMixed(value);
    setSaved(false);
    try {
      const result = await save.mutateAsync({ acceptsMixed: value });
      setAcceptsMixed(result.acceptsMixed);
      setSaved(true);
    } catch (error) {
      setAcceptsMixed(before);
      snackbar.show(messageOf(error, 'Your change could not be saved.'), { tone: 'error' });
    }
  };

  return (
    <SectionCard
      title="Offers"
      description="Choose which offers collectors can make on your cards."
    >
      <SwitchRow
        label="Accept mixed offers (cash + cards)"
        help="On cards offered for trade or sale, collectors can offer an amount together with some of their cards. Negotiations already open continue either way."
        value={acceptsMixed}
        onChange={(value) => void toggle(value)}
        disabled={save.isPending}
        testID="offer-settings-mixed"
      />
      <View style={styles.status} accessibilityLiveRegion="polite" testID="offer-settings-status">
        {save.isPending ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>Saving…</Text>
        ) : saved ? (
          <>
            <MaterialCommunityIcons name="check" size={16} color={palette.success} />
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>Saved</Text>
          </>
        ) : null}
      </View>
      <View style={[styles.callout, { backgroundColor: palette.surfaceVariant }]}>
        <MaterialCommunityIcons name="lightbulb-outline" size={18} color={palette.accent} />
        <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
          Cash and trade offers follow each card&apos;s availability and its “Accepts offers”
          switch, which you set per card in your inventory.
        </Text>
      </View>
      <Button
        label="Open my inventory"
        variant="ghost"
        icon="cards-outline"
        onPress={() => router.navigate('/inventory')}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], minHeight: 20 },
  callout: { flexDirection: 'row', gap: spacing[2], padding: spacing[3], borderRadius: 10 },
  grow: { flex: 1 },
});
