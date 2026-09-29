import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/src/components/ui/Badge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { spacing } from '@/src/theme';

/** Deep-link target: https://www.orenjitrade.com/collectors/<id> and orenjitrade://collectors/<id>. */
export default function CollectorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Collector' }} />
      <Screen scroll testID="screen-collector">
        <View style={styles.header}>
          <Skeleton width={64} height={64} radius={32} />
          <View style={styles.headerText}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="40%" height={14} />
          </View>
        </View>
        <View style={styles.badges}>
          <Badge variant="freshness" value="AGING" />
        </View>
        <EmptyState
          icon="account-search-outline"
          title="Collector profile"
          description={`Public binders, approximate distance and ratings for collector ${id ?? '?'} arrive in Phase 2.`}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[3] },
  headerText: { flex: 1, gap: spacing[2] },
  badges: { flexDirection: 'row', gap: spacing[2] },
});
