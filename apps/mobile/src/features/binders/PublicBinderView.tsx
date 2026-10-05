import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { usePublicBinder, usePublicBinderItems } from '@/src/api/hooks/binders';
import type { InventoryAvailability, PublicBinderResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Badge } from '@/src/components/ui/Badge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { ItemRow } from '@/src/features/inventory/ItemRow';
import { boundedQuery, QUERY_MAX_LENGTH, SEARCH_DEBOUNCE_MS } from '@/src/lib/catalog';
import { distanceBucketLabel } from '@/src/lib/formatDistanceBucket';
import {
  AVAILABILITIES,
  AVAILABILITY_LABELS,
  badgeFreshness,
  binderKindLabel,
  cardCount,
  endsLabel,
} from '@/src/lib/inventory';
import { isLimitReached, limitReachedInfo, limitReachedMessage } from '@/src/lib/limits';
import { GENERIC_AREA_LABEL, placeLabel } from '@/src/lib/location';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

const ANY = '__any__';

export interface PublicBinderViewProps {
  id: string;
}

/**
 * A public binder (web: `/binders/:id`, `GET /public/binders/{id}` + its public cards): only what
 * the owner made public, never private notes, never coordinates (the owner block carries a region
 * label and a distance bucket). Search and availability filters; 404 when it is not public, and
 * the plan's daily binder views explained when they run out.
 */
export function PublicBinderView({ id }: PublicBinderViewProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const binder = usePublicBinder(id);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [availability, setAvailability] = useState<InventoryAvailability | null>(null);
  const items = usePublicBinderItems(id, { q, availability, game: null }, !!binder.data);

  useEffect(() => {
    const timer = setTimeout(() => setQ(boundedQuery(text)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const list = useMemo(
    () => items.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [items.data]
  );

  if (!binder.data) {
    const error = binder.error;
    if (error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED')) {
      return (
        <EmptyState
          testID="public-binder-not-found"
          icon="book-open-page-variant-outline"
          title="This binder is not available"
          description="It does not exist, is private, its publication ended, or its owner has to confirm it is still up to date."
          actionLabel="Back to the map"
          onAction={() => router.navigate('/')}
        />
      );
    }
    if (error && isLimitReached(error)) {
      return (
        <EmptyState
          testID="public-binder-limit"
          icon="speedometer"
          title="You reached today's binder views"
          description={limitReachedMessage(limitReachedInfo(error))}
        />
      );
    }
    if (error) {
      return (
        <ErrorState
          testID="public-binder-error"
          error={error}
          title="This binder could not load"
          onRetry={() => void binder.refetch()}
        />
      );
    }
    return <SkeletonList rows={4} rowHeight={88} testID="public-binder-loading" />;
  }

  const current = binder.data;
  return (
    <>
      <Stack.Screen options={{ title: current.name }} />
      <FlatList
        testID="public-binder-items"
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ItemRow item={item} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <PublicBinderHeader binder={current} />
            <TextField
              label="Search this binder"
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={QUERY_MAX_LENGTH}
              testID="public-binder-search"
            />
            <View style={styles.filters}>
              <SelectSheet
                compact
                label="Availability"
                options={[
                  { value: ANY, label: 'Any availability' },
                  ...AVAILABILITIES.map((value) => ({ value, label: AVAILABILITY_LABELS[value] })),
                ]}
                value={availability ?? ANY}
                onChange={(value) =>
                  setAvailability(value === ANY ? null : (value as InventoryAvailability))
                }
                testID="public-binder-availability"
              />
            </View>
            {items.data ? (
              <Text
                testID="public-binder-count"
                accessibilityLiveRegion="polite"
                style={[textStyle('sm'), { color: palette.textMuted }]}
              >
                {cardCount(items.data.pages[0]?.totalItems ?? 0)}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          items.data ? (
            <EmptyState
              testID="public-binder-empty"
              icon="magnify-close"
              title="No cards match"
              description="Try another availability or search."
            />
          ) : items.error ? (
            <ErrorState
              compact
              testID="public-binder-items-error"
              error={items.error}
              title="The cards could not load"
              onRetry={() => void items.refetch()}
            />
          ) : (
            <SkeletonList rows={3} rowHeight={96} />
          )
        }
        ListFooterComponent={
          <ListFooter
            loading={items.isFetchingNextPage}
            failed={!!items.error && items.hasNextPage}
            onRetry={() => void items.fetchNextPage()}
          />
        }
        onEndReached={() => {
          if (items.hasNextPage && !items.isFetchingNextPage && !items.error) {
            void items.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={binder.isRefetching}
            onRefresh={() => {
              void binder.refetch();
              void items.refetch();
            }}
          />
        }
        contentContainerStyle={styles.content}
      />
    </>
  );
}

function nearLabel(publicLabel: string | null | undefined): string {
  const place = placeLabel(publicLabel);
  return place ? `Near ${place}` : GENERIC_AREA_LABEL;
}

function PublicBinderHeader({ binder }: { binder: PublicBinderResponse }) {
  const { palette } = useTheme();
  const router = useRouter();
  const owner = binder.owner;
  const distance = distanceBucketLabel(owner.location?.distanceBucket);
  const ends = endsLabel(binder.publicUntil);
  return (
    <View style={styles.headerBlock}>
      <View style={styles.titleBlock}>
        <Text
          accessibilityRole="header"
          testID="public-binder-title"
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          {binder.name}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {binderKindLabel(binder.kind)} · {cardCount(binder.itemCount)} public
          {ends ? ` · ${ends}` : ''}
        </Text>
        <View style={styles.row}>
          <Badge variant="freshness" value={badgeFreshness(binder.freshness.state)} />
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {binder.freshness.label}
          </Text>
        </View>
        {binder.description ? (
          <Text style={[textStyle('md'), { color: palette.ink }]}>{binder.description}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${owner.displayName}, @${owner.handle}. Opens their profile.`}
        onPress={() => router.push({ pathname: '/collectors/[id]', params: { id: owner.handle } })}
        testID="public-binder-owner"
        style={({ pressed }) => [
          styles.owner,
          { backgroundColor: palette.surface, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <Avatar src={owner.avatarUrl} name={owner.displayName} size={44} />
        <View style={styles.grow}>
          <Text style={[textStyle('md'), styles.title, { color: palette.ink }]}>
            {owner.displayName}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>@{owner.handle}</Text>
          {owner.location ? (
            <Text
              testID="public-binder-owner-area"
              style={[textStyle('xs'), { color: palette.textMuted }]}
            >
              {nearLabel(owner.location.publicLabel)}
              {distance ? ` · ${distance}` : ''}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { padding: spacing[4], paddingBottom: spacing[8] },
  header: { gap: spacing[3], marginBottom: spacing[3] },
  headerBlock: { gap: spacing[3] },
  titleBlock: { gap: spacing[1] },
  title: { fontWeight: fontWeight.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  filters: { flexDirection: 'row', gap: spacing[2] },
  owner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  grow: { flex: 1, gap: 2 },
  pressed: { opacity: 0.8 },
  separator: { height: spacing[2] },
});
