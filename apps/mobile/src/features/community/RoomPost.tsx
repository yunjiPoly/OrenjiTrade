import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BinderLink, CardLink, PostPhoto, PostResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { fontFamily, fontWeight, radius, spacing, useTheme } from '@/src/theme';

import { ROOM_COPY } from './communityCopy';
import { postPlace, postTime } from './communityHelpers';

/** The full-screen photo viewer's backdrop (a photo reads best on black, in both themes). */
const PHOTO_SCRIM = 'rgba(0, 0, 0, 0.94)';

/** One photo of a post: API media only (ADR 0015 rules), full screen on tap. */
function PostPhotoTile({
  photo,
  index,
  count,
  handle,
  size,
}: {
  photo: PostPhoto;
  index: number;
  count: number;
  handle: string;
  size: { width: number; height: number };
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = safeCardImageUrl(photo.url);
  if (!url || failed) {
    return (
      <View
        testID="room-photo-unavailable"
        accessibilityLabel={ROOM_COPY.photoUnavailable}
        style={[styles.photoMissing, size, { backgroundColor: palette.surface }]}
      >
        <MaterialCommunityIcons name="image-off-outline" size={22} color={palette.textMuted} />
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={ROOM_COPY.photo(index + 1, count, handle)}
        onPress={() => setOpen(true)}
        testID={`room-photo-${index}`}
      >
        <Image
          source={{ uri: url }}
          style={[styles.photo, size, { borderColor: palette.borderStrong }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessible={false}
          onError={() => setFailed(true)}
        />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[styles.viewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Image
            source={{ uri: url }}
            style={styles.viewerImage}
            contentFit="contain"
            accessible
            accessibilityLabel={ROOM_COPY.photoViewer}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ROOM_COPY.closePhoto}
            onPress={() => setOpen(false)}
            style={[styles.viewerClose, { top: insets.top + spacing[2] }]}
            testID="room-photo-close"
          >
            <MaterialCommunityIcons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** Up to 4 photos: one wide, two side by side, three or four in a square grid. */
function PostPhotos({ photos, handle }: { photos: readonly PostPhoto[]; handle: string }) {
  if (photos.length === 0) {
    return null;
  }
  const first = photos[0];
  if (photos.length === 1 && first) {
    const ratio = first.width > 0 && first.height > 0 ? first.width / first.height : 1;
    const width = 260;
    const height = Math.round(Math.min(Math.max(width / ratio, 140), 320));
    return (
      <View testID="room-photos" style={styles.photos}>
        <PostPhotoTile photo={first} index={0} count={1} handle={handle} size={{ width, height }} />
      </View>
    );
  }
  const side = photos.length === 2 ? 128 : 112;
  return (
    <View testID="room-photos" style={[styles.photos, styles.grid, { maxWidth: side * 2 + 6 }]}>
      {photos.map((photo, index) => (
        <PostPhotoTile
          key={`${photo.url}-${index}`}
          photo={photo}
          index={index}
          count={photos.length}
          handle={handle}
          size={{ width: side, height: side }}
        />
      ))}
    </View>
  );
}

/** A shared card: its picture, name and code; opens Who has this card on that printing (13). */
function SharedCard({ card }: { card: CardLink }) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Card: ${card.name}${card.printingCode ? `, ${card.printingCode}` : ''}`}
      onPress={() =>
        router.push({ pathname: '/cards/[id]', params: { id: card.cardId, printing: card.id } })
      }
      testID="room-shared-card"
      style={({ pressed }) => [
        styles.link,
        { backgroundColor: palette.surface, borderColor: palette.borderStrong },
        pressed && styles.pressed,
      ]}
    >
      <CardImage src={card.imageUrl} alt="" size="xs" />
      <View style={styles.linkText}>
        <Text numberOfLines={1} style={[styles.linkName, { color: palette.ink }]}>
          {card.name}
        </Text>
        {card.printingCode ? (
          <Text numberOfLines={1} style={[styles.code, { color: palette.textMuted }]}>
            {card.printingCode}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * A shared binder or deck core: its picture, name and, for a deck core buyers can find, the purple
 * "Deck core" badge and its price; opens the binder or deck core page (16).
 */
function SharedBinder({ binder }: { binder: BinderLink }) {
  const { palette } = useTheme();
  const router = useRouter();
  const url = safeCardImageUrl(binder.imageUrl);
  const core = binder.deckCore === true;
  const price = core ? (binder.askingPriceText ?? null) : null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        core
          ? ROOM_COPY.deckCoreLabel(binder.name, price)
          : ROOM_COPY.binder(binder.name, binder.ownerHandle)
      }
      onPress={() => router.push({ pathname: '/binders/[id]', params: { id: binder.id } })}
      testID={core ? 'room-shared-deck-core' : 'room-shared-binder'}
      style={({ pressed }) => [
        styles.link,
        styles.binderLink,
        { backgroundColor: palette.surface, borderColor: palette.borderStrong },
        pressed && styles.pressed,
      ]}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={[styles.binderThumb, { borderColor: palette.borderStrong }]}
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <View
          style={[
            styles.binderThumb,
            styles.binderIcon,
            {
              borderColor: palette.borderStrong,
              backgroundColor: core ? palette.deckCore.tagBackground : palette.primaryContainer,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={core ? 'cards-outline' : 'book-open-variant'}
            size={22}
            color={core ? palette.deckCore.tagText : palette.onPrimaryContainer}
          />
        </View>
      )}
      <View style={styles.linkText}>
        <Text numberOfLines={2} style={[styles.linkName, { color: palette.ink }]}>
          {binder.name}
        </Text>
        {core ? (
          <View style={styles.coreRow}>
            <View style={[styles.tag, { backgroundColor: palette.deckCore.tagBackground }]}>
              <Text
                maxFontSizeMultiplier={1.4}
                style={[styles.tagText, { color: palette.deckCore.tagText }]}
              >
                {ROOM_COPY.deckCore}
              </Text>
            </View>
            {price ? <Text style={[styles.price, { color: palette.ink }]}>{price}</Text> : null}
          </View>
        ) : (
          <Text numberOfLines={1} style={[styles.small, { color: palette.textMuted }]}>
            {binder.ownerHandle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export interface RoomPostProps {
  post: PostResponse;
  /** The reader wrote it. */
  own: boolean;
  /** Opens the post's "⋯" sheet. */
  onMore: (post: PostResponse) => void;
}

/**
 * One post of a room (stage R11, mockup v50 screen 33), read like a chat: the avatar, the handle,
 * "{province} · {time}" (never a city; the time alone when the author does not share a place),
 * "⋯", the text, up to 4 photos, a shared card (opens Who has this card) or a shared binder or
 * deck core (opens its page). No reply threads on the phone.
 */
export function RoomPost({ post, own, onMore }: RoomPostProps) {
  const { palette } = useTheme();
  const handle = post.author.handle;
  const place = postPlace(post);
  const time = postTime(post.createdAt);
  const line = [place, time].filter(Boolean).join(' · ');
  const photos = post.payload?.photos ?? [];
  return (
    <View testID={`room-post-${post.id}`} style={styles.post}>
      <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={34} />
      <View style={styles.main}>
        <View style={styles.head}>
          <View
            accessible
            accessibilityLabel={ROOM_COPY.postLabel({ handle, own, place, time })}
            style={styles.headText}
          >
            <Text numberOfLines={1} style={[styles.handle, { color: palette.ink }]}>
              {handle}
              {own ? <Text style={{ color: palette.primary }}> · {ROOM_COPY.you}</Text> : null}
            </Text>
            <Text
              numberOfLines={1}
              testID={`room-post-line-${post.id}`}
              style={[styles.line, { color: palette.textDisabled }]}
            >
              {line}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ROOM_COPY.more(handle)}
            onPress={() => onMore(post)}
            hitSlop={8}
            testID={`room-post-more-${post.id}`}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={palette.textMuted} />
          </Pressable>
        </View>
        <Text
          selectable
          testID={`room-post-body-${post.id}`}
          style={[styles.body, { color: palette.ink }]}
        >
          {post.body}
        </Text>
        <PostPhotos photos={photos} handle={handle} />
        {post.payload?.card ? <SharedCard card={post.payload.card} /> : null}
        {post.payload?.binder ? <SharedBinder binder={post.payload.binder} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: spacing[2],
    paddingLeft: spacing[4],
    paddingRight: 12,
  },
  main: { flex: 1, minWidth: 0, gap: 5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: 20 },
  headText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  handle: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  line: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16 },
  more: {
    width: 32,
    height: 32,
    marginVertical: -6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { fontSize: 15, lineHeight: 21 },
  photos: { marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photo: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  photoMissing: { alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  viewer: { flex: 1, backgroundColor: PHOTO_SCRIM, justifyContent: 'center' },
  viewerImage: { flex: 1 },
  viewerClose: {
    position: 'absolute',
    right: spacing[3],
    padding: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  link: {
    alignSelf: 'flex-start',
    maxWidth: 290,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  binderLink: { width: 250 },
  linkText: { flexShrink: 1, minWidth: 0, gap: 2 },
  linkName: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  code: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 },
  binderThumb: { width: 46, height: 46, borderRadius: 8, borderWidth: 1 },
  binderIcon: { alignItems: 'center', justifyContent: 'center' },
  coreRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 7 },
  tagText: { fontSize: 11, lineHeight: 15, fontWeight: fontWeight.bold },
  price: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  small: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.8 },
});
