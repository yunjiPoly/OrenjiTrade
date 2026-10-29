import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { FeedPost } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { GUEST_COPY } from '@/src/features/guest/guestCopy';
import { GuestAvatar } from '@/src/features/guest/GuestParts';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import {
  PINNED_MAX_FONT_SCALE,
  fontFamily,
  fontWeight,
  spacing,
  useStackedRows,
  useTheme,
} from '@/src/theme';
import { HandleText } from '@/src/components/ui/HandleText';

import {
  codeAndRarity,
  feedTime,
  feedWishTerms,
  gridTiles,
  isGrid,
  isUnnamed,
  postHeaderLabel,
  postProvince,
  postVerb,
  postWho,
  previewPrice,
  type CardTile,
  type FeedTone,
} from './feedRules';
import { HOME_COPY } from './homeCopy';

/** Where a post leads (Home's screen does the navigation). */
export interface PostActions {
  /** The collector's profile (19). */
  onCollector: (post: FeedPost) => void;
  /** The collector's cards (the "+n" tile). */
  onCollectorCards: (post: FeedPost) => void;
  /** Who has this card (13) for a card. */
  onCard: (cardId: string, printingId: string) => void;
  /** "Message": the chat with the collector, this card pinned. */
  onMessage: (post: FeedPost, itemId: string) => void;
  /** "I have it" (R6's flow). */
  onHaveIt: (post: FeedPost) => void;
  /** The deck core page (16). */
  onDeckCore: (binderId: string) => void;
  /** The post whose chat is being opened, if any (a spinner on its button). */
  busyPostId: string | null;
}

/** The colour of a verb and of a chip's dot. */
export function useToneColor(): (tone: FeedTone) => string {
  const { palette } = useTheme();
  return (tone) =>
    tone === 'wanted'
      ? palette.accent
      : tone === 'deckCore'
        ? palette.deckCore.tagText
        : palette.textMuted;
}

/** The dot of a kind (its chip): primary orange, accent teal, deckCore purple. */
export function useDotColor(): (tone: FeedTone) => string {
  const { palette } = useTheme();
  return (tone) =>
    tone === 'wanted'
      ? palette.accent
      : tone === 'deckCore'
        ? palette.deckCore.tagText
        : palette.primary;
}

/**
 * A post of Home's feed (mockup v50 screen 10b): the shared header that opens the collector's
 * profile, then the body of its kind.
 */
export function FeedPostCard({
  post,
  now,
  actions,
}: {
  post: FeedPost;
  now: Date;
  actions: PostActions;
}) {
  const { palette } = useTheme();
  const toneColor = useToneColor();
  const { verb, tone } = postVerb(post);
  // At the largest text sizes the avatar goes above the words, and the rows' buttons under them.
  const stacked = useStackedRows();
  const testID = `home-post-${post.id}`;
  // A guest never sees who posted (stage R15): "A collector", a plain avatar, the place.
  const unnamed = isUnnamed(post);
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={postHeaderLabel(post, now)}
        accessibilityHint={unnamed ? undefined : HOME_COPY.headerHint}
        onPress={() => actions.onCollector(post)}
        testID={`${testID}-header`}
        style={({ pressed }) => [
          styles.header,
          stacked && styles.headerStacked,
          pressed && styles.pressed,
        ]}
      >
        {unnamed ? (
          <GuestAvatar size={36} testID={`${testID}-guest-avatar`} />
        ) : (
          <Avatar
            src={post.collector.avatarUrl}
            name={post.collector.displayName ?? postWho(post)}
            size={36}
          />
        )}
        <View style={[styles.headerText, stacked && styles.fullWidth]}>
          {stacked ? (
            // At large text sizes the handle has a line of its own, capped like every handle
            // (owner decision of 2026-10-28; a capped part inside a growing sentence made iOS
            // draw the sentence's lines over each other), the verb under it.
            <>
              <HandleText
                testID={`${testID}-who`}
                style={[styles.headline, styles.handle, { color: palette.ink }]}
              >
                {postWho(post)}
              </HandleText>
              <Text numberOfLines={4} style={[styles.headline, { color: toneColor(tone) }]}>
                {verb}
              </Text>
            </>
          ) : (
            <Text numberOfLines={2} style={[styles.headline, { color: palette.ink }]}>
              <Text style={styles.handle}>{postWho(post)}</Text>{' '}
              <Text style={{ color: toneColor(tone) }}>{verb}</Text>
            </Text>
          )}
          <Text numberOfLines={stacked ? 2 : 1} style={[styles.meta, { color: palette.textMuted }]}>
            {feedTime(post.at, now)} · {postProvince(post)}
          </Text>
        </View>
      </Pressable>
      {post.kind === 'NEW_CARDS' && post.newCards ? (
        isGrid(post.newCards) ? (
          <CardGrid post={post} actions={actions} />
        ) : (
          <SingleCard post={post} actions={actions} stacked={stacked} />
        )
      ) : null}
      {post.kind === 'WANTED' && post.wanted ? (
        <WantedBody post={post} actions={actions} stacked={stacked} />
      ) : null}
      {post.kind === 'DECK_CORE' && post.deckCore ? (
        <DeckCoreBody post={post} actions={actions} stacked={stacked} />
      ) : null}
    </View>
  );
}

/** Two or more cards: a 4-column grid with the price under each picture. */
function CardGrid({ post, actions }: { post: FeedPost; actions: PostActions }) {
  const tiles = post.newCards ? gridTiles(post.newCards) : [];
  const empty = Math.max(0, 4 - tiles.length);
  return (
    <View style={styles.grid} testID={`home-post-${post.id}-grid`}>
      {tiles.map((tile) => (
        <GridTile key={tile.key} tile={tile} post={post} actions={actions} />
      ))}
      {Array.from({ length: empty }, (_, index) => (
        <View key={`empty-${index}`} style={styles.tile} />
      ))}
    </View>
  );
}

function GridTile({
  tile,
  post,
  actions,
}: {
  tile: CardTile;
  post: FeedPost;
  actions: PostActions;
}) {
  const { palette } = useTheme();
  const more = tile.kind === 'more';
  const preview = tile.preview;
  const testID = more ? `home-post-${post.id}-more` : `home-tile-${tile.key}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      accessibilityHint={more ? HOME_COPY.headerHint : HOME_COPY.cardHint}
      onPress={() =>
        more
          ? actions.onCollectorCards(post)
          : preview && actions.onCard(preview.cardId, preview.printingId)
      }
      testID={testID}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={[styles.tileArt, { borderColor: palette.borderStrong }]}>
        <CardImage
          src={preview?.imageUrl}
          alt=""
          size="sm"
          style={styles.tileImage}
          testID={`${testID}-image`}
        />
        {more ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.moreCover,
              { backgroundColor: palette.home.moreScrim },
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.4}
              style={[styles.moreText, { color: palette.home.moreText }]}
            >
              {HOME_COPY.moreTile(tile.count)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        // Four prices side by side: they follow the text size only a little, or none could be read.
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.tilePrice, { color: palette.home.chipText }]}
        testID={`${testID}-price`}
      >
        {more ? HOME_COPY.moreTilePrice : (tile.price ?? '')}
      </Text>
    </Pressable>
  );
}

/** Exactly one card: a row (opens Who has this card) and the round Message button. */
function SingleCard({
  post,
  actions,
  stacked,
}: {
  post: FeedPost;
  actions: PostActions;
  stacked: boolean;
}) {
  const { palette } = useTheme();
  const preview = post.newCards?.previews?.[0];
  if (!preview) {
    return null;
  }
  const price = previewPrice(preview);
  const { code, rarity } = codeAndRarity(preview);
  const busy = actions.busyPostId === post.id;
  return (
    <View style={[styles.row, stacked && styles.rowStacked]} testID={`home-post-${post.id}-single`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[preview.name, code, rarity, price].filter(Boolean).join(', ')}
        accessibilityHint={HOME_COPY.cardHint}
        onPress={() => actions.onCard(preview.cardId, preview.printingId)}
        testID={`home-tile-${preview.itemId}`}
        style={({ pressed }) => [
          styles.rowMain,
          stacked && styles.rowMainStacked,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.rowArt, { borderColor: palette.borderStrong }]}>
          <CardImage src={preview.imageUrl} alt="" size="sm" style={styles.rowImage} />
        </View>
        <View style={[styles.rowText, stacked && styles.fullWidth]}>
          <Text numberOfLines={stacked ? 2 : 1} style={[styles.rowName, { color: palette.ink }]}>
            {preview.name}
          </Text>
          {code || rarity ? (
            <Text
              numberOfLines={stacked ? 2 : 1}
              style={[styles.rowMeta, { color: palette.textMuted }]}
            >
              {code ? <Text style={styles.mono}>{code}</Text> : null}
              {code && rarity ? ' · ' : ''}
              {rarity ?? ''}
            </Text>
          ) : null}
          {price ? (
            <Text numberOfLines={1} style={[styles.rowPrice, { color: palette.ink }]}>
              {price}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isUnnamed(post)
            ? GUEST_COPY.messageLabel(preview.name)
            : HOME_COPY.messageAbout(postWho(post), preview.name)
        }
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => actions.onMessage(post, preview.itemId)}
        testID={`home-post-${post.id}-message`}
        style={({ pressed }) => [
          styles.roundButton,
          { backgroundColor: palette.home.messageFill },
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <MaterialCommunityIcons name="message-outline" size={20} color={palette.primary} />
        )}
      </Pressable>
    </View>
  );
}

/** A wish: the picture, the name, the terms and "I have it". */
function WantedBody({
  post,
  actions,
  stacked,
}: {
  post: FeedPost;
  actions: PostActions;
  stacked: boolean;
}) {
  const { palette } = useTheme();
  const wish = post.wanted;
  if (!wish) {
    return null;
  }
  const busy = actions.busyPostId === post.id;
  return (
    <View style={[styles.row, stacked && styles.rowStacked]} testID={`home-post-${post.id}-wish`}>
      <View
        style={[styles.rowMain, stacked && styles.rowMainStacked]}
        accessible
        accessibilityLabel={`${wish.name}, ${feedWishTerms(wish)}`}
      >
        <View style={[styles.rowArt, { borderColor: palette.borderStrong }]}>
          <CardImage src={wish.imageUrl} alt="" size="sm" style={styles.rowImage} />
        </View>
        <View style={[styles.rowText, stacked && styles.fullWidth]}>
          <Text numberOfLines={stacked ? 2 : 1} style={[styles.rowName, { color: palette.ink }]}>
            {wish.name}
          </Text>
          <Text style={[styles.terms, { color: palette.textMuted }]}>{feedWishTerms(wish)}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isUnnamed(post)
            ? GUEST_COPY.haveLabel(wish.name)
            : HOME_COPY.haveItLabel(wish.name, postWho(post))
        }
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => actions.onHaveIt(post)}
        hitSlop={4}
        testID={`home-post-${post.id}-have`}
        style={({ pressed }) => [
          styles.haveButton,
          { borderColor: palette.primary },
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.6}
            style={[styles.haveText, { color: palette.primary }]}
          >
            {HOME_COPY.haveIt}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/** A deck core: the band (first photo, or key cards), the name and price, the note line. */
function DeckCoreBody({
  post,
  actions,
  stacked,
}: {
  post: FeedPost;
  actions: PostActions;
  stacked: boolean;
}) {
  const { palette } = useTheme();
  const core = post.deckCore;
  if (!core) {
    return null;
  }
  const photo = safeCardImageUrl(core.photoUrl);
  const price = core.askingPriceText?.trim() || null;
  const note = core.noteFirstLine?.trim() || null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={HOME_COPY.deckCoreLabel(core.name, price, note)}
      accessibilityHint={HOME_COPY.deckCoreHint}
      onPress={() => actions.onDeckCore(core.binderId)}
      testID={`home-post-${post.id}-core`}
      style={({ pressed }) => [styles.core, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.band,
          { borderColor: palette.borderStrong, backgroundColor: palette.deckCore.surface },
        ]}
      >
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessible={false}
          />
        ) : (
          <View style={styles.keyCards}>
            {(core.previewImages ?? []).slice(0, 3).map((url, index) => (
              <View
                key={`${url}-${index}`}
                style={[styles.keyCard, { borderColor: palette.borderStrong }]}
              >
                <CardImage src={url} alt="" size="sm" style={styles.keyCardImage} />
              </View>
            ))}
            {(core.previewImages ?? []).length === 0 ? (
              <MaterialCommunityIcons
                name="cards-outline"
                size={32}
                color={palette.deckCore.tagText}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.tag, { backgroundColor: palette.deckCore.tagBackground }]}>
          <Text
            maxFontSizeMultiplier={1.4}
            style={[styles.tagText, { color: palette.deckCore.tagText }]}
          >
            {HOME_COPY.deckCoreTag}
          </Text>
        </View>
        {core.photoCount >= 2 ? (
          <View
            style={[styles.photos, { backgroundColor: palette.home.badgeBackground }]}
            testID={`home-post-${post.id}-photos`}
          >
            <MaterialCommunityIcons
              name="camera-outline"
              size={12}
              color={palette.home.badgeText}
            />
            <Text
              maxFontSizeMultiplier={1.4}
              style={[styles.photosText, { color: palette.home.badgeText }]}
            >
              {HOME_COPY.photos(core.photoCount)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.coreLine, stacked && styles.coreLineStacked]}>
        <Text numberOfLines={stacked ? 2 : 1} style={[styles.coreName, { color: palette.ink }]}>
          {core.name}
        </Text>
        {price ? (
          <Text numberOfLines={1} style={[styles.corePrice, { color: palette.ink }]}>
            {price}
          </Text>
        ) : null}
      </View>
      {note ? (
        <Text numberOfLines={1} style={[styles.note, { color: palette.textMuted }]}>
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing[3],
    gap: spacing[3],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  fullWidth: { flex: 0, alignSelf: 'stretch' },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  headline: { fontSize: 14, lineHeight: 18 },
  handle: { fontWeight: fontWeight.semibold },
  meta: { fontSize: 12, lineHeight: 16 },
  grid: { flexDirection: 'row', gap: spacing[2] },
  tile: { flex: 1, minWidth: 0, gap: 5 },
  tileArt: {
    aspectRatio: 59 / 86,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tileImage: { width: '100%', height: '100%', borderRadius: 0 },
  moreCover: { alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: fontFamily.display, fontSize: 18, fontWeight: fontWeight.bold },
  tilePrice: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  rowMainStacked: {
    flex: 0,
    alignSelf: 'stretch',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  rowArt: { width: 48, height: 70, borderRadius: 5, borderWidth: 1, overflow: 'hidden' },
  rowImage: { width: '100%', height: '100%', borderRadius: 0 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowName: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  rowMeta: { fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: fontFamily.mono },
  rowPrice: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold },
  terms: { fontSize: 12, lineHeight: 16 },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haveButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 140,
  },
  haveText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  core: { gap: spacing[2] },
  band: {
    height: 132,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyCards: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  keyCard: { width: 64, height: 90, borderRadius: 5, borderWidth: 1, overflow: 'hidden' },
  keyCardImage: { width: '100%', height: '100%', borderRadius: 0 },
  tag: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: { fontSize: 11, lineHeight: 15, fontWeight: fontWeight.bold },
  photos: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  photosText: { fontSize: 11, lineHeight: 15, fontWeight: fontWeight.semibold },
  coreLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[3] },
  coreLineStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  coreName: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  corePrice: {
    flexShrink: 0,
    maxWidth: '45%',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: fontWeight.bold,
  },
  note: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.75 },
});
