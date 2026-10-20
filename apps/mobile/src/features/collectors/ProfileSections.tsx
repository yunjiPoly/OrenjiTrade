import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import type {
  PublicBinderSummary,
  PublicInventoryItem,
  ReferenceResponse,
  WishlistItemResponse,
  WishlistSummaryEntry,
} from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { CardImage } from '@/src/components/ui/CardImage';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { DeckCoreTag } from '@/src/features/binders/BinderRows';
import { itemPriceText } from '@/src/features/inventory/itemPrice';
import { wishTerms } from '@/src/features/wishlist/wishlistLabels';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { printingImageUrl } from '@/src/lib/catalog';
import { fontFamily, fontWeight, radius, spacing, useStackedRows, useTheme } from '@/src/theme';

import { PROFILE_COPY } from './profileCopy';
import { referenceMonth } from './profileRules';

/** What a section needs of a query: its data, its failure and a retry. */
export interface SectionQuery<T> {
  data: T | undefined;
  error: ApiError | null;
  refetch: () => unknown;
}

/** A section's title (Sora 17) with its "See all" link on the right (teal, as the mockup). */
export function SectionHeader({
  title,
  onSeeAll,
  testID,
}: {
  title: string;
  onSeeAll?: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.ink }]}>
        {title}
      </Text>
      {onSeeAll ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={PROFILE_COPY.seeAllOf(title)}
          onPress={onSeeAll}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
          testID={`${testID}-see-all`}
          style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
        >
          <Text style={[styles.seeAllLabel, { color: palette.accent }]}>{PROFILE_COPY.seeAll}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The quiet line of an empty section, or its failure with "Try again". */
export function SectionNote({
  text,
  onRetry,
  testID,
}: {
  text: string;
  onRetry?: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.note} testID={testID}>
      <Text style={[styles.noteText, { color: palette.textMuted }]}>{text}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          hitSlop={8}
          testID={`${testID}-retry`}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={[styles.seeAllLabel, { color: palette.accent }]}>{PROFILE_COPY.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RailSkeleton({
  width,
  height,
  testID,
}: {
  width: number;
  height: number;
  testID: string;
}) {
  return (
    <View
      style={styles.railSkeleton}
      testID={testID}
      accessibilityLabel={PROFILE_COPY.loading}
      aria-busy
    >
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} width={width} height={height} radius={radius.sm} />
      ))}
    </View>
  );
}

/** A sideways rail, gutters included (16 pt). */
function Rail({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Cards: a sideways rail of the collector's public cards (`GET /collectors/{handle}/inventory`),
 * the picture with the name and the price as typed under it. Larger text sizes widen the tiles.
 */
export function CardsSection({
  items,
  own,
  onOpen,
  onSeeAll,
}: {
  items: SectionQuery<{ items?: PublicInventoryItem[] }>;
  own: boolean;
  onOpen: (item: PublicInventoryItem) => void;
  onSeeAll: (() => void) | undefined;
}) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  const list = items.data?.items ?? [];
  const width = stacked ? 120 : 84;
  const height = Math.round(width * 1.45);
  let body;
  if (items.data) {
    body =
      list.length === 0 ? (
        <SectionNote
          text={own ? PROFILE_COPY.emptyCards.own : PROFILE_COPY.emptyCards.other}
          testID="profile-cards-empty"
        />
      ) : (
        <Rail testID="profile-cards-rail">
          {list.map((item) => {
            const price = itemPriceText(item);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={[item.card.name, price].filter(Boolean).join(', ')}
                onPress={() => onOpen(item)}
                testID={`profile-card-${item.id}`}
                style={({ pressed }) => [styles.cardTile, { width }, pressed && styles.pressed]}
              >
                <CardImage
                  src={printingImageUrl(item.printing)}
                  alt=""
                  game={item.card.game}
                  size="sm"
                  style={[styles.cardPicture, { width, height, borderColor: palette.borderStrong }]}
                />
                <Text
                  numberOfLines={stacked ? 2 : 1}
                  style={[styles.tileName, { color: palette.ink }]}
                >
                  {item.card.name}
                </Text>
                {price ? (
                  <Text numberOfLines={1} style={[styles.tilePrice, { color: palette.ink }]}>
                    {price}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </Rail>
      );
  } else if (items.error) {
    body = (
      <SectionNote
        text={PROFILE_COPY.sectionError(PROFILE_COPY.cards)}
        onRetry={() => void items.refetch()}
        testID="profile-cards-error"
      />
    );
  } else {
    body = <RailSkeleton width={width} height={height} testID="profile-cards-loading" />;
  }
  return (
    <View style={styles.section} testID="profile-cards">
      <SectionHeader
        title={PROFILE_COPY.cards}
        onSeeAll={own || list.length > 0 ? onSeeAll : undefined}
        testID="profile-cards"
      />
      {body}
    </View>
  );
}

/** Three card pictures fanned in a binder's tile (mockup screen 19). */
function TileFan({ urls }: { urls: readonly string[] }) {
  const { palette } = useTheme();
  const shown = [urls[1] ?? null, urls[2] ?? null, urls[0] ?? null];
  const places = [styles.fanLeft, styles.fanRight, styles.fanMiddle];
  return (
    <View style={StyleSheet.absoluteFill} accessible={false}>
      {shown.map((url, index) => {
        const uri = safeCardImageUrl(url);
        return (
          <View
            key={index}
            style={[
              styles.fanCard,
              places[index],
              { borderColor: palette.borderStrong, backgroundColor: palette.surfaceVariant },
            ]}
          >
            {uri ? (
              <Image
                source={{ uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessible={false}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Binders: deck cores with their photo and the purple "Deck core" tag, the price under the name;
 * binders with a fan of their cards and "{n} cards" (`GET /collectors/{handle}/binders`).
 */
export function BindersSection({
  binders,
  own,
  onOpen,
  onSeeAll,
}: {
  binders: SectionQuery<PublicBinderSummary[]>;
  own: boolean;
  onOpen: (binder: PublicBinderSummary) => void;
  onSeeAll: (() => void) | undefined;
}) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  const list = binders.data ?? [];
  const width = stacked ? 200 : 160;
  let body;
  if (binders.data) {
    body =
      list.length === 0 ? (
        <SectionNote
          text={own ? PROFILE_COPY.emptyBinders.own : PROFILE_COPY.emptyBinders.other}
          testID="profile-binders-empty"
        />
      ) : (
        <Rail testID="profile-binders-rail">
          {list.map((binder) => {
            const core = binder.sellsAsCore;
            const detail = core
              ? (binder.askingPriceText ?? null)
              : PROFILE_COPY.cardCount(binder.itemCount);
            const photo = safeCardImageUrl(core ? binder.previewImages?.[0] : null);
            return (
              <Pressable
                key={binder.id}
                accessibilityRole="button"
                accessibilityLabel={[
                  binder.name,
                  core ? PROFILE_COPY.deckCore.toLowerCase() : null,
                  detail,
                ]
                  .filter(Boolean)
                  .join(', ')}
                onPress={() => onOpen(binder)}
                testID={`profile-binder-${binder.id}`}
                style={({ pressed }) => [styles.binderTile, { width }, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.binderFrame,
                    core
                      ? {
                          backgroundColor: palette.deckCore.tagBackground,
                          borderColor: palette.borderStrong,
                        }
                      : { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}
                >
                  {core ? (
                    <>
                      {photo ? (
                        <Image
                          source={{ uri: photo }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          accessible={false}
                        />
                      ) : null}
                      <View style={styles.coreTag}>
                        <DeckCoreTag
                          label={PROFILE_COPY.deckCore}
                          testID={`profile-binder-tag-${binder.id}`}
                        />
                      </View>
                    </>
                  ) : (
                    <TileFan urls={binder.previewImages ?? []} />
                  )}
                </View>
                <Text numberOfLines={1} style={[styles.binderName, { color: palette.ink }]}>
                  {binder.name}
                </Text>
                {detail ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      core ? styles.tilePrice : styles.binderCount,
                      { color: core ? palette.ink : palette.textMuted },
                    ]}
                  >
                    {detail}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </Rail>
      );
  } else if (binders.error) {
    body = (
      <SectionNote
        text={PROFILE_COPY.sectionError(PROFILE_COPY.binders)}
        onRetry={() => void binders.refetch()}
        testID="profile-binders-error"
      />
    );
  } else {
    body = <RailSkeleton width={width} height={80} testID="profile-binders-loading" />;
  }
  return (
    <View style={styles.section} testID="profile-binders">
      <SectionHeader
        title={PROFILE_COPY.binders}
        onSeeAll={own || list.length > 0 ? onSeeAll : undefined}
        testID="profile-binders"
      />
      {body}
    </View>
  );
}

/** One wish as a profile row shows it (another collector's public summary, or your own wish). */
export interface WishRowEntry {
  key: string;
  cardId: string;
  cardName: string;
  imageUrl: string | null;
  game: string | null;
  terms: string;
  printing: WishlistSummaryEntry['printing'] | null;
  rarity: string | null;
  /** Your own wish's id (the row edits it). */
  wishId?: string;
}

export function wishRowFromSummary(
  entry: WishlistSummaryEntry,
  index: number
): WishRowEntry | null {
  if (!entry.card?.id) {
    return null;
  }
  return {
    key: `${entry.card.id}-${entry.printing?.id ?? entry.rarity ?? 'any'}-${index}`,
    cardId: entry.card.id,
    cardName: entry.card.name,
    imageUrl: printingImageUrl(entry.printing) ?? entry.card.imageUrl ?? null,
    game: null,
    terms: wishTerms(entry),
    printing: entry.printing ?? null,
    rarity: entry.rarity ?? null,
  };
}

export function wishRowFromOwn(item: WishlistItemResponse): WishRowEntry | null {
  if (!item.card?.id) {
    return null;
  }
  return {
    key: item.id,
    cardId: item.card.id,
    cardName: item.card.name,
    imageUrl: item.card.imageUrl ?? null,
    game: item.game ?? null,
    terms: wishTerms(item),
    printing: item.printing ?? null,
    rarity: item.rarity ?? null,
    wishId: item.id,
  };
}

/**
 * One row of "Looking for": the picture, the name and the terms; another collector's with "I have
 * it" (owner spec, section 10), yours opening the wish to edit it.
 */
export function WishRow({
  entry,
  own,
  handle,
  busy,
  canHave,
  onHave,
  onEdit,
}: {
  entry: WishRowEntry;
  own: boolean;
  handle: string;
  busy: boolean;
  /** "I have it" only where a chat can start (not your own, not when they take no messages). */
  canHave: boolean;
  onHave: () => void;
  onEdit: () => void;
}) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  const content = (
    <>
      <CardImage
        src={entry.imageUrl}
        alt=""
        game={entry.game}
        size="xs"
        style={[styles.wishPicture, { borderColor: palette.borderStrong }]}
      />
      <View style={styles.wishText}>
        <Text
          numberOfLines={stacked ? undefined : 1}
          style={[styles.wishName, { color: palette.ink }]}
        >
          {entry.cardName}
        </Text>
        <Text
          numberOfLines={stacked ? undefined : 1}
          style={[styles.wishTerms, { color: palette.textMuted }]}
          testID={`profile-wish-${entry.key}-terms`}
        >
          {entry.terms}
        </Text>
      </View>
    </>
  );
  const frame = [
    styles.wishRow,
    stacked && !own && styles.wishRowStacked,
    { backgroundColor: palette.surface, borderColor: palette.border },
  ];
  if (own) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.cardName}, ${entry.terms}`}
        accessibilityHint="Edits this wish"
        onPress={onEdit}
        testID={`profile-wish-${entry.key}`}
        style={({ pressed }) => [...frame, pressed && styles.pressed]}
      >
        {content}
        <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
      </Pressable>
    );
  }
  return (
    <View
      style={frame}
      testID={`profile-wish-${entry.key}`}
      accessible={!canHave}
      accessibilityLabel={canHave ? undefined : `${entry.cardName}, ${entry.terms}`}
    >
      <View style={styles.wishMain}>{content}</View>
      {canHave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PROFILE_COPY.iHaveItLabel(entry.cardName, handle)}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onHave}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          testID={`profile-have-${entry.cardId}`}
          style={({ pressed }) => [
            styles.have,
            stacked && styles.haveStacked,
            { borderColor: palette.primary },
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <Text style={[styles.haveLabel, { color: palette.primary }]}>
              {PROFILE_COPY.iHaveIt}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** About: the bio, or a short line when there is none. */
export function AboutSection({ bio, empty }: { bio: string; empty: string }) {
  const { palette } = useTheme();
  const text = bio.trim();
  return (
    <View style={styles.section} testID="profile-about">
      <SectionHeader title={PROFILE_COPY.about} testID="profile-about" />
      <Text
        testID="profile-bio-text"
        style={[styles.bio, styles.gutter, { color: text ? palette.ink : palette.textMuted }]}
      >
        {text || empty}
      </Text>
    </View>
  );
}

/** Five stars for an average (half stars from .25, full from .75). */
export function Stars({ average, size = 14 }: { average: number; size?: number }) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={PROFILE_COPY.outOfFive(average.toFixed(1))}
      style={styles.stars}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const left = average - (star - 1);
        const name = left >= 0.75 ? 'star' : left >= 0.25 ? 'star-half-full' : 'star-outline';
        return (
          <MaterialCommunityIcons key={star} name={name} size={size} color={palette.warning} />
        );
      })}
    </View>
  );
}

/**
 * Ratings & references: "★ {rating} · {n} ratings" as a card (the big number, the stars, the
 * count), the 2 latest references (handle, month, text) and "See all references".
 */
export function RatingsSection({
  average,
  count,
  references,
  onSeeAll,
  onAuthor,
}: {
  average: number | null;
  count: number;
  references: SectionQuery<ReferenceResponse[]>;
  onSeeAll: () => void;
  onAuthor: (handle: string) => void;
}) {
  const { palette } = useTheme();
  const latest = (references.data ?? []).slice(0, 2);
  let refs;
  if (references.data) {
    refs =
      latest.length === 0 ? (
        <SectionNote text={PROFILE_COPY.noReferences} testID="profile-references-empty" />
      ) : (
        <View style={[styles.refs, styles.gutter]}>
          {latest.map((reference) => (
            <View
              key={reference.id}
              style={styles.ref}
              testID={`profile-reference-${reference.id}`}
            >
              <Avatar
                src={reference.author.avatarUrl}
                name={reference.author.displayName}
                size={32}
              />
              <View style={styles.refText}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityHint="Opens their profile"
                  onPress={() => onAuthor(reference.author.handle)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={[styles.refName, { color: palette.ink }]}>
                    {reference.author.handle}
                    <Text style={[styles.refWhen, { color: palette.textMuted }]}>
                      {` · ${referenceMonth(reference.createdAt)}`}
                    </Text>
                  </Text>
                </Pressable>
                <Text style={[styles.refBody, { color: palette.ink }]}>{reference.body}</Text>
              </View>
            </View>
          ))}
        </View>
      );
  } else if (references.error) {
    refs = (
      <SectionNote
        text={PROFILE_COPY.sectionError('References')}
        onRetry={() => void references.refetch()}
        testID="profile-references-error"
      />
    );
  } else {
    refs = (
      <View style={styles.gutter}>
        <Skeleton height={48} testID="profile-references-loading" />
      </View>
    );
  }
  return (
    <View style={styles.section} testID="profile-ratings">
      <SectionHeader title={PROFILE_COPY.ratings} testID="profile-ratings" />
      {average !== null && count > 0 ? (
        <View
          style={[
            styles.summary,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          testID="profile-rating-summary"
        >
          <Text style={[styles.average, { color: palette.ink }]}>{average.toFixed(1)}</Text>
          <View style={styles.summaryText}>
            <Stars average={average} />
            <Text style={[styles.count, { color: palette.textMuted }]}>
              {PROFILE_COPY.ratingCount(count)}
            </Text>
          </View>
        </View>
      ) : (
        <SectionNote text={PROFILE_COPY.noRatings} testID="profile-ratings-empty" />
      )}
      {refs}
      <Pressable
        accessibilityRole="link"
        onPress={onSeeAll}
        testID="profile-references-see-all"
        style={({ pressed }) => [styles.allRefs, pressed && styles.pressed]}
      >
        <Text style={[styles.seeAllLabel, { color: palette.accent }]}>
          {PROFILE_COPY.seeAllReferences}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  gutter: { paddingHorizontal: spacing[4] },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  sectionTitle: {
    flexShrink: 1,
    fontFamily: fontFamily.display,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  seeAll: { minHeight: 32, justifyContent: 'center' },
  seeAllLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  note: { paddingHorizontal: spacing[4], gap: spacing[1], alignItems: 'flex-start' },
  noteText: { fontSize: 13, lineHeight: 18 },
  retry: { minHeight: 36, justifyContent: 'center' },
  rail: { gap: 10, paddingHorizontal: spacing[4] },
  railSkeleton: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing[4] },
  cardTile: { gap: 6 },
  cardPicture: { borderRadius: 6, borderWidth: 1 },
  tileName: { fontSize: 12, lineHeight: 16 },
  tilePrice: { fontSize: 13, lineHeight: 17, fontWeight: fontWeight.bold },
  binderTile: { gap: 8 },
  binderFrame: {
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  coreTag: { position: 'absolute', left: 8, top: 8 },
  fanCard: {
    position: 'absolute',
    width: 40,
    height: 58,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fanLeft: { left: '24%', top: 14, transform: [{ rotate: '-10deg' }] },
  fanMiddle: { left: '37.5%', top: 10 },
  fanRight: { left: '51%', top: 14, transform: [{ rotate: '10deg' }] },
  binderName: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  binderCount: { fontSize: 13, lineHeight: 17 },
  wishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  wishRowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  wishMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  wishPicture: { width: 36, height: 52, borderRadius: 4, borderWidth: 1 },
  wishText: { flex: 1, minWidth: 0, gap: 2 },
  wishName: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  wishTerms: { fontSize: 12, lineHeight: 16 },
  have: {
    minHeight: 36,
    minWidth: 84,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haveStacked: { alignSelf: 'flex-start', minHeight: 44 },
  haveLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  bio: { fontSize: 14, lineHeight: 21 },
  summary: {
    marginHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  average: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
  },
  summaryText: { gap: 4, flexShrink: 1 },
  stars: { flexDirection: 'row', gap: 2 },
  count: { fontSize: 12, lineHeight: 16 },
  refs: { gap: 14 },
  ref: { flexDirection: 'row', gap: 10 },
  refText: { flex: 1, minWidth: 0, gap: 3 },
  refName: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  refWhen: { fontWeight: fontWeight.regular },
  refBody: { fontSize: 14, lineHeight: 20 },
  allRefs: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing[4],
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
