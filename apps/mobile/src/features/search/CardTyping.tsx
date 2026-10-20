import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EMPTY_CARD_SEARCH, useCardSearch } from '@/src/api/hooks/catalog';
import { COLLECTORS_MIN_CHARS, useCollectorsByName } from '@/src/api/hooks/search';
import { useUid } from '@/src/api/hooks/useUid';
import type { CardSummary, CollectorByName } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { CardImage } from '@/src/components/ui/CardImage';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { RecentSearches } from '@/src/features/catalog/RecentSearches';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';
import { useBrowsingGame } from '@/src/features/games/browsingGame';
import { SEARCH_DEBOUNCE_MS, boundedQuery } from '@/src/lib/catalog';
import { GENERIC_PLACE_LABEL } from '@/src/lib/place';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { highlightParts } from './highlight';
import { SearchInput } from './SearchField';
import { TYPING_COPY } from './searchCopy';

export interface CardTypingProps {
  /** The text a link or a recent search starts with. */
  initialText?: string;
  /** "Cancel": back to the map. */
  onCancel: () => void;
}

/**
 * Typing a card (owner spec 2026-10-14, section 8, mockup screen 12; stage G): the focused field
 * "{game} card name or code" with Clear and "Cancel"; with no text, the recent searches of this
 * phone (up to 8, "Clear", the line that only the collector sees them); while typing, the cards of
 * the browsed game as they come (no game chips: the game pill chooses the game), each with its
 * picture and its name, the typed part in orange, nothing else (no count); a result opens Who has
 * this card. When the text matches collectors of the browsed game by handle or name, a short
 * "Collectors" section under the cards (at most 3: avatar, handle, state or province) opens their
 * profile. No match: "No {game} card matches “{text}”" and the hint.
 */
export function CardTyping({ initialText = '', onCancel }: CardTypingProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const uid = useUid();
  const remember = useRecentSearchesStore((state) => state.remember);
  const browsing = useBrowsingGame();
  const game = browsing.game;
  const gameName = browsing.current.name;
  const [text, setText] = useState(initialText);
  const [query, setQuery] = useState(boundedQuery(initialText));

  // Results as you type (debounced like the rest of the app's fields).
  useEffect(() => {
    const q = boundedQuery(text);
    if (q === query) {
      return undefined;
    }
    const timer = setTimeout(() => setQuery(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query]);

  // New results (another text or game) start at the first card (native large-text flow, R5
  // review fix 1).
  const list = useRef<FlatList<CardSummary>>(null);
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query, game]);

  const typed = query.length > 0;
  const cards = useCardSearch({ ...EMPTY_CARD_SEARCH, q: query, game }, typed && browsing.ready);
  // The first page only: typing narrows the results, and the collectors stay under the cards.
  const results = useMemo(() => (typed ? (cards.data?.pages[0]?.items ?? []) : []), [cards, typed]);
  const collectors = useCollectorsByName(query);
  const people = query.length >= COLLECTORS_MIN_CHARS ? (collectors.data ?? []) : [];

  // What the field holds, not the debounced query: the Search key pressed right after typing
  // kept nothing, or a word cut where the collector paused (stage R5 review, U2).
  const keep = () => {
    const kept = boundedQuery(text);
    if (uid && kept) {
      remember(uid, kept);
    }
    return kept;
  };
  // The Search key also searches at once.
  const submit = () => setQuery(keep());
  const openCard = (card: CardSummary) => {
    keep();
    if (card.id) {
      router.push({ pathname: '/cards/[id]', params: { id: card.id } });
    }
  };
  const openCollector = (collector: CollectorByName) => {
    keep();
    router.push({ pathname: '/collectors/[id]', params: { id: collector.handle } });
  };
  const searchAgain = (value: string) => {
    setText(value);
    setQuery(boundedQuery(value));
  };

  const field = (
    <SearchInput
      value={text}
      onChangeText={setText}
      onSubmitEditing={submit}
      label={TYPING_COPY.field(gameName)}
      placeholder={TYPING_COPY.field(gameName)}
      onCancel={onCancel}
      highlighted
      autoFocus
      testID="search-input"
    />
  );

  if (!typed && text.trim().length === 0) {
    return (
      <View style={styles.fill} testID="search-typing">
        <View style={styles.head}>{field}</View>
        <FlatList
          data={[]}
          renderItem={null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={<RecentSearches uid={uid} onPick={searchAgain} />}
          contentContainerStyle={styles.list}
          testID="search-recent"
        />
      </View>
    );
  }

  const answered = !!cards.data && !cards.isPlaceholderData;
  let empty = null;
  if (!cards.data && cards.error) {
    empty = (
      <ErrorState
        testID="search-error"
        error={cards.error}
        title={TYPING_COPY.error}
        onRetry={() => void cards.refetch()}
      />
    );
  } else if (!cards.data || (!answered && results.length === 0)) {
    empty = <TypingSkeleton />;
  } else {
    empty = (
      <View style={styles.noMatch} testID="search-no-match">
        <Text style={[textStyle('md'), styles.bold, { color: palette.ink }]}>
          {TYPING_COPY.noMatch(gameName, query)}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {TYPING_COPY.noMatchHint}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fill} testID="search-typing">
      <View style={styles.head}>
        {field}
      </View>
      <FlatList
        ref={list}
        testID="search-results"
        style={styles.fill}
        data={results}
        keyExtractor={(card, index) => card.id ?? String(index)}
        renderItem={({ item }) => <CardResult card={item} query={query} onPress={openCard} />}
        ListEmptyComponent={empty}
        ListFooterComponent={
          people.length > 0 ? (
            <View style={styles.collectors} testID="search-collectors">
              <Text
                accessibilityRole="header"
                style={[textStyle('md', 'heading'), styles.bold, { color: palette.ink }]}
              >
                {TYPING_COPY.collectors}
              </Text>
              {people.map((person) => (
                <CollectorResult key={person.id} collector={person} onPress={openCollector} />
              ))}
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

/** One card while typing: its picture and its name, the typed part highlighted; no count. */
const CardResult = memo(function CardResult({
  card,
  query,
  onPress,
}: {
  card: CardSummary;
  query: string;
  onPress: (card: CardSummary) => void;
}) {
  const { palette } = useTheme();
  const name = card.name ?? '';
  const parts = highlightParts(name, query);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint="Opens who has this card"
      onPress={() => onPress(card)}
      testID={`search-result-${card.id}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <CardImage src={card.primaryImageUrl} alt="" game={card.game} size="xs" />
      <View style={styles.fill}>
        <Text style={[textStyle('md'), styles.bold, { color: palette.ink }]}>
          {parts.before}
          {parts.match ? <Text style={{ color: palette.primary }}>{parts.match}</Text> : null}
          {parts.after}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
    </Pressable>
  );
});

/** One collector while typing: avatar, handle, state or province (never a city). */
function CollectorResult({
  collector,
  onPress,
}: {
  collector: CollectorByName;
  onPress: (collector: CollectorByName) => void;
}) {
  const { palette } = useTheme();
  const place = collector.place?.subdivisionName || collector.place?.label || GENERIC_PLACE_LABEL;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${collector.handle}, ${place}`}
      accessibilityHint="Opens their profile"
      onPress={() => onPress(collector)}
      testID={`search-collector-${collector.handle}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <Avatar
        src={collector.avatarUrl}
        name={collector.displayName || collector.handle}
        size={40}
      />
      <View style={styles.fill}>
        <Text style={[textStyle('md'), styles.bold, { color: palette.ink }]}>
          {collector.handle}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{place}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
    </Pressable>
  );
}

function TypingSkeleton() {
  return (
    <View
      testID="search-loading"
      accessibilityLabel={TYPING_COPY.loading}
      aria-busy
      style={styles.skeleton}
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={36} height={50} radius={radius.sm} />
          <View style={styles.fill}>
            <Skeleton width="65%" height={16} />
            <Skeleton width="30%" height={12} style={styles.skeletonGap} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { gap: spacing[3], paddingBottom: spacing[2] },
  list: { flexGrow: 1, paddingBottom: spacing[6] },
  bold: { fontWeight: fontWeight.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 64,
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collectors: { marginTop: spacing[4], gap: spacing[1] },
  noMatch: { gap: spacing[2], paddingVertical: spacing[6] },
  skeleton: { gap: spacing[3], paddingTop: spacing[2] },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  skeletonGap: { marginTop: spacing[2] },
  pressed: { opacity: 0.75 },
});
