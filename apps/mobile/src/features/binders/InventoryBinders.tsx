import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useMyBinders } from '@/src/api/hooks/binders';
import { useGames } from '@/src/api/hooks/profile';
import type { BinderResponse } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { gameOptions } from '@/src/features/games/browsingGame';
import { GameTile } from '@/src/features/games/GameTile';
import { ListingsPausedBanner } from '@/src/features/inventory/ListingsPausedBanner';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, useTheme } from '@/src/theme';

import { INVENTORY_BINDERS_COPY } from './binderCopy';
import { bindersByGame, orderBinders } from './binderForm';
import { OwnBinderRow } from './BinderRows';
import { ReorderBindersSheet } from './ReorderBindersSheet';

type Entry =
  | { kind: 'section'; game: string; name: string; count: number }
  | { kind: 'binder'; binder: BinderResponse }
  | { kind: 'tip' }
  | { kind: 'reorder' };

/**
 * Inventory › Binders (owner spec 2026-10-14, section 7, mockup screen 17): "{n} binders · {n}
 * deck cores" with "New binder"; one section per game that has binders, in the games' order (stage
 * G: the game's 22 pt tile, its name and "{n} binders"), each with its deck cores first (photo,
 * name, "{n} photos · Public", the purple tag "Deck core · {price}"), then its binders (a fan of
 * three cards, the name, "{n} cards · Public" or "· Private"); the tip "Selling a whole deck?" at
 * the end. A row opens Edit binder. Reordering the binders stays, as a small link under the tip
 * (the least clutter, section 2).
 */
export function InventoryBinders() {
  const router = useRouter();
  const { palette } = useTheme();
  const binders = useMyBinders();
  const [reordering, setReordering] = useState(false);
  const [pulling, setPulling] = useState(false);
  const open = useCallback(
    (binder: BinderResponse) =>
      router.push({ pathname: '/binders/edit', params: { id: binder.id } }),
    [router]
  );
  const ordered = useMemo(() => orderBinders(binders.data ?? []), [binders.data]);
  const games = useGames().data;
  const entries = useMemo<Entry[]>(() => {
    const options = gameOptions(games);
    const rows: Entry[] = [];
    for (const section of bindersByGame(
      binders.data ?? [],
      options.map((option) => option.slug)
    )) {
      rows.push({
        kind: 'section',
        game: section.game,
        name:
          options.find((option) => option.slug === section.game)?.name ?? gameLabel(section.game),
        count: section.binders.length,
      });
      for (const binder of section.binders) {
        rows.push({ kind: 'binder', binder });
      }
    }
    if (rows.length === 0) {
      return rows;
    }
    rows.push({ kind: 'tip' });
    if ((binders.data?.length ?? 0) > 1) {
      rows.push({ kind: 'reorder' });
    }
    return rows;
  }, [binders.data, games]);

  if (!binders.data && binders.error) {
    return (
      <ErrorState
        testID="binders-error"
        error={binders.error}
        title={INVENTORY_BINDERS_COPY.loadError}
        onRetry={() => void binders.refetch()}
      />
    );
  }
  if (!binders.data) {
    return <SkeletonList rows={3} rowHeight={88} testID="binders-loading" />;
  }

  const summary = INVENTORY_BINDERS_COPY.summary(ordered.binders.length, ordered.cores.length);
  return (
    <>
      <FlatList
        testID="binders-list"
        data={entries}
        keyExtractor={(entry) =>
          entry.kind === 'binder'
            ? entry.binder.id
            : entry.kind === 'section'
              ? `inventory-binders-section-${entry.game}`
              : `inventory-binders-${entry.kind}`
        }
        renderItem={({ item }) => {
          if (item.kind === 'binder') {
            return <OwnBinderRow binder={item.binder} onPress={open} />;
          }
          if (item.kind === 'section') {
            return <GameSection game={item.game} name={item.name} count={item.count} />;
          }
          if (item.kind === 'tip') {
            return <DeckCoreTip />;
          }
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={INVENTORY_BINDERS_COPY.reorderLabel}
              onPress={() => setReordering(true)}
              testID="binders-reorder"
              style={({ pressed }) => [styles.reorder, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="swap-vertical" size={18} color={palette.textMuted} />
              <Text style={[styles.reorderLabel, { color: palette.textMuted }]}>
                {INVENTORY_BINDERS_COPY.reorder}
              </Text>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <ListingsPausedBanner />
            <View style={styles.summaryRow}>
              {binders.data.length > 0 ? (
                <Text
                  testID="binders-summary"
                  style={[styles.summary, { color: palette.textMuted }]}
                >
                  <Text style={[styles.summaryStrong, { color: palette.ink }]}>
                    {summary.binders}
                  </Text>
                  {summary.rest}
                </Text>
              ) : (
                <View style={styles.grow} />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={INVENTORY_BINDERS_COPY.newBinder}
                onPress={() => router.push('/binders/new')}
                hitSlop={8}
                testID="inventory-new-binder"
                style={({ pressed }) => [styles.newBinder, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="plus" size={16} color={palette.accent} />
                <Text
                  maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                  style={[styles.newBinderLabel, { color: palette.accent }]}
                >
                  {INVENTORY_BINDERS_COPY.newBinder}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            testID="binders-empty"
            icon="book-open-page-variant-outline"
            title={INVENTORY_BINDERS_COPY.emptyTitle}
            description={INVENTORY_BINDERS_COPY.emptyBody}
            actionLabel={INVENTORY_BINDERS_COPY.emptyAction}
            onAction={() => router.push('/binders/new')}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true);
              void binders.refetch().finally(() => setPulling(false));
            }}
          />
        }
        contentContainerStyle={styles.content}
      />
      <ReorderBindersSheet
        visible={reordering}
        binders={binders.data}
        onClose={() => setReordering(false)}
      />
    </>
  );
}

/** A game's section title (stage G, screen 17): its 22 pt tile, its name, "{n} binders". */
function GameSection({ game, name, count }: { game: string; name: string; count: number }) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={INVENTORY_BINDERS_COPY.sectionLabel(name, count)}
      style={styles.section}
      testID={`binders-section-${game}`}
    >
      <GameTile slug={game} name={name} size={22} />
      <Text style={[styles.sectionName, { color: palette.ink }]}>{name}</Text>
      <Text style={[styles.sectionCount, { color: palette.textMuted }]}>
        {INVENTORY_BINDERS_COPY.sectionCount(count)}
      </Text>
    </View>
  );
}

/** "Selling a whole deck?" (screen 17): the tip at the end of the list, in a dashed frame. */
function DeckCoreTip() {
  const { palette } = useTheme();
  return (
    <View
      testID="binders-tip"
      accessible
      // The words only: the icon's glyph was read first (R3 leftover U8).
      accessibilityLabel={`${INVENTORY_BINDERS_COPY.tipTitle} ${INVENTORY_BINDERS_COPY.tipBody}`}
      style={[styles.tip, { borderColor: palette.borderStrong }]}
    >
      <MaterialCommunityIcons
        name="cards-outline"
        size={20}
        color={palette.deckCore.tagText}
        style={styles.tipIcon}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[styles.tipText, { color: palette.textMuted }]}>
        <Text style={[styles.tipStrong, { color: palette.ink }]}>
          {INVENTORY_BINDERS_COPY.tipTitle}
        </Text>{' '}
        {INVENTORY_BINDERS_COPY.tipBody}
      </Text>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  header: { gap: spacing[3], marginTop: spacing[3], marginBottom: 10 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  summary: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  summaryStrong: { fontWeight: fontWeight.semibold },
  grow: { flex: 1 },
  newBinder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  newBinderLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  separator: { height: 10 },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: 4,
  },
  sectionName: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.semibold },
  sectionCount: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.medium },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  tipIcon: { marginTop: 1 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19 },
  tipStrong: { fontWeight: fontWeight.semibold },
  reorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  reorderLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
