import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BinderLink, CardLink, PostPhoto, PostResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { fontFamily, fontWeight, radius, spacing, useTheme } from '@/src/theme';

import { ROOM_COPY } from './communityCopy';
import { postPlace, postTime } from './communityHelpers';

/** The longest side of a post's only photo, in points. */
const SINGLE_PHOTO_MAX = 220;

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
    // One photo: its own shape, the longest side 220 pt (a tall phone photo stays a thumbnail;
    // the full photo opens on tap).
    const ratio = first.width > 0 && first.height > 0 ? first.width / first.height : 1;
    const width = ratio >= 1 ? SINGLE_PHOTO_MAX : Math.round(SINGLE_PHOTO_MAX * ratio);
    const height = ratio >= 1 ? Math.round(SINGLE_PHOTO_MAX / ratio) : SINGLE_PHOTO_MAX;
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

/**
 * A binder the post shared that the reader can no longer open (no longer public, sold or deleted,
 * its owner blocked with the reader): a plain row without a link, its name or its owner (stage R11
 * review fix 1).
 */
function UnavailableBinder() {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={ROOM_COPY.binderUnavailable}
      testID="room-binder-unavailable"
      style={[
        styles.link,
        styles.binderLink,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View
        style={[
          styles.binderThumb,
          styles.binderIcon,
          { borderColor: palette.border, backgroundColor: palette.surfaceVariant },
        ]}
      >
        <MaterialCommunityIcons name="book-off-outline" size={22} color={palette.textMuted} />
      </View>
      <Text style={[styles.linkText, styles.small, { color: palette.textMuted }]}>
        {ROOM_COPY.binderUnavailable}
      </Text>
    </View>
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
 * deck core (opens its page). The avatar and the handle open the author's profile (their ratings
 * before an e-Transfer). Beside the handle, a long province gives way and the time stays whole; at
 * large text sizes "{province} · {time}" goes under the handle, on as many lines as it needs. No
 * reply threads on the phone.
 */
export function RoomPost({ post, own, onMore }: RoomPostProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const handle = post.author.handle;
  const place = postPlace(post);
  const time = postTime(post.createdAt);
  const line = [place, time].filter(Boolean).join(' · ');
  const photos = post.payload?.photos ?? [];
  // Side by side, the handle and the line were cut to a few letters at the largest sizes.
  const large = useWindowDimensions().fontScale > 1.3;
  const openProfile = () =>
    router.push({ pathname: '/collectors/[id]', params: { id: post.author.handle } });
  return (
    <View testID={`room-post-${post.id}`} style={styles.post}>
      {/* The handle below is the accessible link; the avatar is a larger target for a finger. */}
      <Pressable
        onPress={openProfile}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={`room-post-avatar-${post.id}`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={34} />
      </Pressable>
      <View style={styles.main}>
        <View style={[styles.head, large && styles.headLarge]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={ROOM_COPY.postLabel({ handle, own, place, time })}
            accessibilityHint={ROOM_COPY.profileHint(handle)}
            onPress={openProfile}
            testID={`room-post-author-${post.id}`}
            style={({ pressed }) => [
              large ? styles.headTextLarge : styles.headText,
              pressed && styles.pressed,
            ]}
          >
            <Text numberOfLines={large ? 3 : 1} style={[styles.handle, { color: palette.ink }]}>
              {handle}
              {own ? <Text style={{ color: palette.primary }}> · {ROOM_COPY.you}</Text> : null}
            </Text>
            {large ? (
              // Under the handle, as many lines as a long province needs: a cap cut the time
              // ("Community of / Madrid · 12:1…", stage R11 review fix 2).
              <Text
                testID={`room-post-line-${post.id}`}
                style={[styles.lineLarge, { color: palette.textDisabled }]}
              >
                {line}
              </Text>
            ) : (
              // One line beside the handle: a long province gives way, the time never does.
              <View testID={`room-post-line-${post.id}`} style={styles.line}>
                {place ? (
                  <Text
                    numberOfLines={1}
                    testID={`room-post-place-${post.id}`}
                    style={[styles.place, { color: palette.textDisabled }]}
                  >
                    {place}
                  </Text>
                ) : null}
                {time ? (
                  <Text
                    numberOfLines={1}
                    testID={`room-post-time-${post.id}`}
                    style={[styles.time, { color: palette.textDisabled }]}
                  >
                    {place ? ` · ${time}` : time}
                  </Text>
                ) : null}
              </View>
            )}
          </Pressable>
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
        {!post.payload?.binder && post.payload?.binderUnavailable ? <UnavailableBinder /> : null}
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
  headLarge: { alignItems: 'flex-start' },
  headTextLarge: { flex: 1, minWidth: 0, gap: 2 },
  handle: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  line: { flex: 1, minWidth: 0, flexDirection: 'row' },
  place: { flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 16 },
  time: { flexShrink: 0, fontSize: 12, lineHeight: 16 },
  lineLarge: { fontSize: 12, lineHeight: 16 },
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
