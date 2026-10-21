import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useDeletingBinder, useMyBinders } from '@/src/api/hooks/binders';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { BinderEditorScreen } from '@/src/features/binders/BinderEditor';
import { PublicBinderView } from '@/src/features/binders/PublicBinderView';
import { spacing, useTheme } from '@/src/theme';

/**
 * A binder (deep-link target: https://www.orenjitrade.com/binders/<id> and
 * orenjitrade://binders/<id>): Edit binder for one of the collector's own binders (spec
 * 2026-10-14, section 7, screen 18), the public view for anyone else's: the deck core page
 * (screen 16) or the public binder page. `?view=public` shows the owner what buyers see. While
 * Edit binder deletes the binder, it stays on screen (the binder has left the collector's list by
 * then), so it can close every screen of the binder and land on Inventory › Binders.
 * `?from=notifications` (a freshness reminder's "Review the binder", stage R9): Back says so.
 */
export default function BinderScreen() {
  const { id, view, from } = useLocalSearchParams<{ id: string; view?: string; from?: string }>();
  const { palette } = useTheme();
  const mine = useMyBinders();
  const deleting = useDeletingBinder(id);
  const own = deleting || (mine.data?.some((binder) => binder.id === id) ?? false);

  let content;
  if (view === 'public' || (mine.data && !own) || (!mine.data && mine.error)) {
    // Not one of the collector's binders (or the list cannot tell): the public view answers.
    content = <PublicBinderView id={id} />;
  } else if (mine.data) {
    content = (
      <BinderEditorScreen id={id} from={from === 'notifications' ? 'notifications' : null} />
    );
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
