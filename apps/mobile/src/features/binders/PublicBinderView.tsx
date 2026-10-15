import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import { usePublicBinder, usePublicBinderItems } from '@/src/api/hooks/binders';
import type { PublicBinderResponse } from '@/src/api/types';
import { BackBar } from '@/src/components/ui/BackBar';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text, TextInput } from '@/src/components/ui/Text';
import { ItemRow } from '@/src/features/inventory/ItemRow';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { reportParams } from '@/src/features/reports/reportLabels';
import { boundedQuery, QUERY_MAX_LENGTH, SEARCH_DEBOUNCE_MS } from '@/src/lib/catalog';
import { endsLabel } from '@/src/lib/inventory';
import { isLimitReached, limitReachedInfo, limitReachedMessage } from '@/src/lib/limits';
import { gameLabel } from '@/src/lib/profile';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { DECK_CORE_COPY, PUBLIC_BINDER_COPY } from './binderCopy';
import { DeckCorePage } from './DeckCorePage';
import { SellerRow } from './SellerRow';

export interface PublicBinderViewProps {
  id: string;
}

/**
 * A public binder (`GET /public/binders/{id}`): a deck core opens its own page (screen 16); a
 * plain binder keeps the public binder screen, restyled to the look of the redesign (spec
 * 2026-10-14, section 7): its name, its cards and games, the seller row, the note, "Search this
 * binder", its public cards, "Report" and "Message {handle}". Never a private note or a city (the
 * owner block carries a state or province); 404 when it is not public, and the daily binder views
 * explained when they run out.
 */
export function PublicBinderView({ id }: PublicBinderViewProps) {
  const router = useRouter();
  const binder = usePublicBinder(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!binder.data) {
    const error = binder.error;
    let content;
    if (error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED')) {
      content = (
        <EmptyState
          testID="public-binder-not-found"
          icon="book-open-page-variant-outline"
          title={DECK_CORE_COPY.notFoundTitle}
          description={DECK_CORE_COPY.notFoundBody}
          actionLabel={DECK_CORE_COPY.notFoundAction}
          onAction={() => router.navigate('/')}
        />
      );
    } else if (error && isLimitReached(error)) {
      content = (
        <EmptyState
          testID="public-binder-limit"
          icon="speedometer"
          title={DECK_CORE_COPY.limitTitle}
          description={limitReachedMessage(limitReachedInfo(error))}
        />
      );
    } else if (error) {
      content = (
        <ErrorState
          testID="public-binder-error"
          error={error}
          title={DECK_CORE_COPY.loadError}
          onRetry={() => void binder.refetch()}
        />
      );
    } else {
      content = <SkeletonList rows={4} rowHeight={88} testID="public-binder-loading" />;
    }
    return <Frame onBack={back}>{content}</Frame>;
  }

  if (binder.data.sellsAsCore) {
    return (
      <DeckCorePage
        binder={binder.data}
        refreshing={binder.isRefetching}
        onRefresh={() => void binder.refetch()}
      />
    );
  }
  return (
    <PlainBinder
      binder={binder.data}
      onBack={back}
      refreshing={binder.isRefetching}
      onRefresh={() => void binder.refetch()}
    />
  );
}

/** The screen's own top row (the redesign's back bar) over a loading, empty or error state. */
function Frame({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="public-binder-frame"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <BackBar label="" backLabel={PUBLIC_BINDER_COPY.backLabel} onBack={onBack} />
      </View>
      <View style={styles.frameBody}>{children}</View>
    </View>
  );
}

function PlainBinder({
  binder,
  onBack,
  refreshing,
  onRefresh,
}: {
  binder: PublicBinderResponse;
  onBack: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const items = usePublicBinderItems(binder.id, { q, availability: null, game: null });
  const selfId = useAccount().me?.id ?? null;
  const { message, startingId } = useMessageCollector();
  const own = binder.owner.id === selfId;

  useEffect(() => {
    const timer = setTimeout(() => setQ(boundedQuery(text)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const list = useMemo(
    () => items.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [items.data]
  );

  return (
    <View
      testID="public-binder"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false, title: binder.name }} />
      <View style={styles.top}>
        <BackBar
          label={binder.name}
          backLabel={PUBLIC_BINDER_COPY.backLabel}
          onBack={onBack}
          testID="public-binder-back"
        />
      </View>
      <FlatList
        testID="public-binder-items"
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ItemRow item={item} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <PlainHeader
            binder={binder}
            text={text}
            onText={setText}
            count={items.data?.pages[0]?.totalItems ?? null}
          />
        }
        ListEmptyComponent={
          items.data ? (
            <EmptyState
              testID="public-binder-empty"
              icon="magnify-close"
              title={PUBLIC_BINDER_COPY.emptyTitle}
              description={PUBLIC_BINDER_COPY.emptyBody}
            />
          ) : items.error ? (
            <ErrorState
              compact
              testID="public-binder-items-error"
              error={items.error}
              title={PUBLIC_BINDER_COPY.cardsLoadError}
              onRetry={() => void items.refetch()}
            />
          ) : (
            <SkeletonList rows={3} rowHeight={96} />
          )
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <ListFooter
              loading={items.isFetchingNextPage}
              failed={!!items.error && items.hasNextPage}
              onRetry={() => void items.fetchNextPage()}
            />
            {own ? null : <ReportLink binder={binder} />}
          </View>
        }
        onEndReached={() => {
          if (items.hasNextPage && !items.isFetchingNextPage && !items.error) {
            void items.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              onRefresh();
              void items.refetch();
            }}
          />
        }
        contentContainerStyle={styles.content}
      />
      {own ? null : (
        <View
          style={[
            styles.bar,
            {
              borderTopColor: palette.border,
              paddingBottom: Math.max(insets.bottom, spacing[4]),
            },
          ]}
        >
          <PillButton
            label={DECK_CORE_COPY.message(binder.owner.handle)}
            icon="message-outline"
            loading={startingId === binder.owner.id}
            onPress={() => void message(binder.owner.id)}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="public-binder-message"
          />
        </View>
      )}
    </View>
  );
}

function PlainHeader({
  binder,
  text,
  onText,
  count,
}: {
  binder: PublicBinderResponse;
  text: string;
  onText: (text: string) => void;
  count: number | null;
}) {
  const { palette } = useTheme();
  const games = binder.games.map(gameLabel).join(', ');
  const ends = endsLabel(binder.publicUntil);
  return (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          testID="public-binder-title"
          style={[styles.title, { color: palette.ink }]}
        >
          {binder.name}
        </Text>
        <Text testID="public-binder-line" style={[styles.line, { color: palette.textMuted }]}>
          {PUBLIC_BINDER_COPY.cardsLine(binder.itemCount, games)}
          {ends ? PUBLIC_BINDER_COPY.ends(ends) : ''}
          {` · ${binder.freshness.label}`}
        </Text>
      </View>
      <SellerRow
        owner={binder.owner}
        publicBinders={binder.ownerPublicBinderCount ?? 1}
        testID="public-binder-owner"
      />
      {binder.description ? (
        <Text style={[styles.note, { color: palette.ink }]}>{binder.description}</Text>
      ) : null}
      <View
        style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <MaterialCommunityIcons name="magnify" size={18} color={palette.textMuted} />
        <TextInput
          value={text}
          onChangeText={onText}
          placeholder={PUBLIC_BINDER_COPY.search}
          placeholderTextColor={palette.textMuted}
          accessibilityLabel={PUBLIC_BINDER_COPY.search}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={QUERY_MAX_LENGTH}
          returnKeyType="search"
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="public-binder-search"
          style={[styles.searchInput, { color: palette.ink }]}
        />
      </View>
      {count !== null ? (
        <Text
          testID="public-binder-count"
          accessibilityLiveRegion="polite"
          style={[styles.line, { color: palette.textMuted }]}
        >
          {PUBLIC_BINDER_COPY.count(count)}
        </Text>
      ) : null}
    </View>
  );
}

function ReportLink({ binder }: { binder: PublicBinderResponse }) {
  const { palette } = useTheme();
  const router = useRouter();
  const owner = binder.owner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={DECK_CORE_COPY.reportLabel(owner.displayName || owner.handle)}
      onPress={() =>
        router.push({
          pathname: '/report',
          params: reportParams(owner, { source: 'BINDER', binderId: binder.id }),
        })
      }
      testID="public-binder-report"
      style={({ pressed }) => [styles.report, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="flag-outline" size={16} color={palette.textMuted} />
      <Text style={[styles.reportLabel, { color: palette.textMuted }]}>
        {DECK_CORE_COPY.report}
      </Text>
    </Pressable>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },
  frameBody: { flex: 1, padding: spacing[4] },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  header: { gap: 14, paddingTop: spacing[2], marginBottom: spacing[3] },
  titleBlock: { gap: 4 },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  line: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 15, lineHeight: 22 },
  search: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  searchInput: { flex: 1, minHeight: 42, fontSize: 15, paddingVertical: 0 },
  separator: { height: spacing[2] },
  footer: { gap: spacing[2] },
  report: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  reportLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  bar: {
    paddingHorizontal: spacing[4],
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.8 },
});
