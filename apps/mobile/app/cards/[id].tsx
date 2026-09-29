import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/src/components/ui/Badge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { spacing } from '@/src/theme';

/** Deep-link target: https://www.orenjitrade.com/cards/<id> and orenjitrade://cards/<id>. */
export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Card' }} />
      <Screen scroll testID="screen-card">
        <View style={styles.hero}>
          <Skeleton width={160} height={224} radius={12} />
        </View>
        <View style={styles.badges}>
          <Badge variant="condition" value="MINT" />
          <Badge variant="condition" value="DAMAGED" />
        </View>
        <EmptyState
          icon="cards-playing-outline"
          title="Card detail"
          description={`Printings, conditions and nearby owners of card ${id ?? '?'} arrive in Phase 2.`}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing[4] },
  badges: { flexDirection: 'row', justifyContent: 'center', gap: spacing[2] },
});
