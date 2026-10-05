import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BinderResponse } from '@/src/api/types';
import { Badge } from '@/src/components/ui/Badge';
import { binderVisibilityStatus } from '@/src/features/inventory/visibilityStatus';
import { badgeFreshness, binderKindLabel, cardCount } from '@/src/lib/inventory';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface BinderRowProps {
  binder: BinderResponse;
  ownerVisible: boolean | null;
  onPress: (binder: BinderResponse) => void;
}

/** One of the collector's binders: name, kind, cards, games, visibility and freshness. */
export function BinderRow({ binder, ownerVisible, onPress }: BinderRowProps) {
  const { palette } = useTheme();
  const status = binderVisibilityStatus(binder, { ownerVisible });
  const games = binder.games.map(gameLabel).join(', ');
  const counts =
    binder.visibility === 'PRIVATE'
      ? cardCount(binder.itemCount)
      : `${cardCount(binder.itemCount)} · ${binder.publicItemCount} public`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${binder.name}, ${binderKindLabel(binder.kind)}, ${counts}, ${status.label}`}
      onPress={() => onPress(binder)}
      testID={`binder-row-${binder.id}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: palette.primaryContainer }]}>
        <MaterialCommunityIcons
          name="book-open-page-variant-outline"
          size={24}
          color={palette.onPrimaryContainer}
        />
      </View>
      <View style={styles.text}>
        <Text style={[textStyle('md'), styles.name, { color: palette.ink }]} numberOfLines={1}>
          {binder.name}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
          {binderKindLabel(binder.kind)} · {counts}
          {games ? ` · ${games}` : ''}
        </Text>
        <View style={styles.status}>
          <MaterialCommunityIcons
            name={binder.visibility === 'PRIVATE' ? 'lock-outline' : 'earth'}
            size={14}
            color={status.pending ? palette.warning : palette.textMuted}
          />
          <Text
            style={[
              textStyle('xs'),
              { color: status.pending ? palette.warning : palette.textMuted },
            ]}
            numberOfLines={1}
          >
            {status.label}
          </Text>
          {binder.freshness.state !== 'ACTIVE' ? (
            <Badge variant="freshness" value={badgeFreshness(binder.freshness.state)} />
          ) : null}
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={palette.textDisabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  name: { fontWeight: fontWeight.semibold },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], flexWrap: 'wrap' },
  pressed: { opacity: 0.8 },
});
