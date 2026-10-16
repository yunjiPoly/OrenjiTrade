import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import type {
  CollectorProfileResponse,
  PublicBinderSummary,
  PublicInventoryPage,
} from '@/src/api/types';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { SectionCard } from '@/src/components/ui/Layout';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { deckCoreTag, publicBinderKindParts } from '@/src/features/binders/binderCopy';
import { CoreThumb, DeckCoreTag } from '@/src/features/binders/BinderRows';
import { ItemRow } from '@/src/features/inventory/ItemRow';
import { badgeFreshness, binderKindLabel, cardCount } from '@/src/lib/inventory';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

interface QueryPart<T> {
  data: T | undefined;
  error: ApiError | null;
  refetch: () => unknown;
}

/** The collector's public binders (`GET /collectors/{handle}/binders`): loading, empty, failed. */
export function PublicBindersSection({
  profile,
  isOwn,
  binders,
}: {
  profile: CollectorProfileResponse;
  isOwn: boolean;
  binders: QueryPart<PublicBinderSummary[]>;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  let content;
  if (binders.data) {
    content =
      binders.data.length > 0 ? (
        <View style={styles.list}>
          {binders.data.map((binder) => (
            <Pressable
              key={binder.id}
              accessibilityRole="link"
              accessibilityLabel={[binder.name, ...publicBinderKindParts(binder)].join(', ')}
              onPress={() => router.push({ pathname: '/binders/[id]', params: { id: binder.id } })}
              testID={`collector-binder-${binder.id}`}
              style={({ pressed }) => [
                styles.binder,
                { borderColor: palette.border, backgroundColor: palette.surface },
                pressed && styles.pressed,
              ]}
            >
              {binder.sellsAsCore ? (
                <CoreThumb url={binder.previewImages?.[0]} size={40} />
              ) : (
                <MaterialCommunityIcons
                  name="book-open-variant"
                  size={24}
                  color={palette.primary}
                />
              )}
              <View style={styles.grow}>
                <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
                  {binder.name}
                </Text>
                {binder.sellsAsCore ? (
                  // A deck core: its tag and price, never "0 cards" (its cards sell only with it).
                  <View style={styles.coreLine}>
                    <DeckCoreTag
                      label={deckCoreTag(binder.askingPriceText)}
                      testID={`collector-binder-tag-${binder.id}`}
                    />
                    {binder.games.length ? (
                      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                        {binder.games.map(gameLabel).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                    {binderKindLabel(binder.kind)} · {cardCount(binder.itemCount)}
                    {binder.games.length ? ` · ${binder.games.map(gameLabel).join(', ')}` : ''}
                  </Text>
                )}
              </View>
              <Badge variant="freshness" value={badgeFreshness(binder.freshness.state)} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text
          testID="collector-binders-empty"
          style={[textStyle('sm'), { color: palette.textMuted }]}
        >
          {isOwn
            ? 'No public binders yet. Publish a binder so collectors of your region can see what you trade.'
            : `No public binders yet. When ${profile.displayName} publishes a binder, it will show up here.`}
        </Text>
      );
  } else if (binders.error) {
    content = (
      <View style={styles.inline} testID="collector-binders-error">
        <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>
          Public binders could not load.
        </Text>
        <Button label="Retry" variant="ghost" onPress={() => void binders.refetch()} />
      </View>
    );
  } else {
    content = <SkeletonList rows={2} rowHeight={56} testID="collector-binders-loading" />;
  }
  return (
    <SectionCard title="Public binders" testID="collector-binders">
      {content}
    </SectionCard>
  );
}

/** A preview of the public cards across binders (`GET /collectors/{handle}/inventory`). */
export function PublicCardsSection({
  items,
  profile,
}: {
  items: QueryPart<PublicInventoryPage>;
  profile: CollectorProfileResponse;
}) {
  const { palette } = useTheme();
  const list = items.data?.items ?? [];
  if (!items.data || list.length === 0) {
    // Nothing to add (no public cards, still loading, or failed: the binders say the rest).
    return null;
  }
  const total = items.data.totalItems ?? list.length;
  return (
    <SectionCard title="Public cards" testID="collector-cards">
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{cardCount(total)}</Text>
      <View style={styles.list}>
        {list.map((item) => (
          <ItemRow key={item.id} item={item} testID={`collector-card-${item.id}`} />
        ))}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  binder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  grow: { flex: 1, gap: 2 },
  coreLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[1] },
  strong: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
