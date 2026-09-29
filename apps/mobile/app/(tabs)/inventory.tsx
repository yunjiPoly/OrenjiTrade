import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/src/components/ui/Badge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/** Inventory tab: the collector's own binders and cards (Phase 3). */
export default function InventoryScreen() {
  const { palette } = useTheme();
  const router = useRouter();

  return (
    <Screen scroll testID="screen-inventory">
      <View style={styles.section}>
        <Text style={[textStyle('sm'), styles.sectionTitle, { color: palette.textMuted }]}>Binders</Text>
        <SkeletonList rows={2} rowHeight={88} />
      </View>
      <View style={styles.badges}>
        <Badge variant="freshness" value="FRESH" />
        <Badge variant="condition" value="NEAR_MINT" />
        <Badge variant="condition" value="LIGHTLY_PLAYED" />
      </View>
      <EmptyState
        icon="cards-outline"
        title="Your inventory is empty"
        description="Add cards to a binder to let nearby collectors know what you own, trade or sell."
        actionLabel="Sign in to add cards"
        onAction={() => router.push('/(auth)/sign-in')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[2], marginBottom: spacing[4] },
  sectionTitle: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  badges: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[2] },
});
