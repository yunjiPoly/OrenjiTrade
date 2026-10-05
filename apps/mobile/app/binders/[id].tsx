import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useMyBinders } from '@/src/api/hooks/binders';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { OwnBinderView } from '@/src/features/binders/OwnBinderView';
import { PublicBinderView } from '@/src/features/binders/PublicBinderView';
import { spacing, useTheme } from '@/src/theme';

/**
 * A binder (deep-link target: https://www.orenjitrade.com/binders/<id> and
 * orenjitrade://binders/<id>): the owner's view for one of the collector's own binders, the public
 * view for anyone else's (also the owner's "Public page", `?view=public`).
 */
export default function BinderScreen() {
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  const { palette } = useTheme();
  const mine = useMyBinders();
  const own = mine.data?.some((binder) => binder.id === id) ?? false;

  let content;
  if (view === 'public' || (mine.data && !own) || (!mine.data && mine.error)) {
    // Not one of the collector's binders (or the list cannot tell): the public view answers.
    content = <PublicBinderView id={id} />;
  } else if (mine.data) {
    content = <OwnBinderView id={id} />;
  } else {
    content = (
      <View style={styles.loading}>
        <SkeletonList rows={4} rowHeight={72} testID="binder-resolving" />
      </View>
    );
  }

  return (
    <View testID="screen-binder" style={[styles.fill, { backgroundColor: palette.background }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { padding: spacing[4] },
});
