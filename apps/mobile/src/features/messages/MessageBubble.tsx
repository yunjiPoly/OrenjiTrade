import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MessageImage, MessageResponse } from '@/src/api/types';
import { Text } from '@/src/components/ui/Text';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { fontWeight, radius, scrimColor, spacing, useTheme } from '@/src/theme';

import { OfferUnavailableLine, SharedLinkCard } from './LinkCards';
import { isOfferMessage } from './messageText';
import { SaleMessage } from './SaleMessage';

/** Largest photo side in a bubble (dp). */
const PHOTO_MAX = 172;
/** Behind a photo opened full screen: nearly opaque, and not a pure black (theme/scrim.ts). */
const PHOTO_SCRIM = scrimColor('rgba(0, 0, 0, 0.92)');

/** "2:14 PM" (the time under a group of messages). */
export function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}

/**
 * One message (owner spec 2026-10-14, section 10, mockup screens 23 and 24): the reader's own in
 * orange on the right, the other collector's in a dark bubble on the left, line breaks kept (an
 * address); a shared card (picture, name, code and price) or binder; a photo (tap to view it full
 * screen); a sale, worded for the reader (`SaleMessage`); an old offer or trade as the grey line
 * "Offer (no longer available)" (a text sent with an offer link stays, in its bubble). Removed
 * messages keep their place with a neutral note. The time sits under the last message of a group
 * (the thread list draws it).
 */
export function MessageBubble({
  message,
  own,
  selfId,
  otherHandle,
  onRate,
}: {
  message: MessageResponse;
  own: boolean;
  selfId: string | null;
  otherHandle: string;
  /** "Rate {other}" of a sale message. */
  onRate: () => void;
}) {
  const { palette } = useTheme();
  const bubbleColors = own
    ? { backgroundColor: palette.primary }
    : { backgroundColor: palette.chat.otherBubble };
  const textColor = own ? palette.onPrimary : palette.ink;
  if (isOfferMessage(message)) {
    const caption =
      message.kind === 'OFFER_LINK' && message.moderationState !== 'REMOVED' && message.body;
    return (
      <View style={styles.offer} testID={`message-${message.id}`}>
        <OfferUnavailableLine testID={`message-${message.id}-offer`} />
        {caption ? (
          <View style={[styles.bubble, own ? styles.own : styles.other, bubbleColors]}>
            <Text selectable style={[styles.body, { color: textColor }]}>
              {caption}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
  if (message.kind === 'SYSTEM') {
    if (message.payload?.sale) {
      return (
        <SaleMessage
          sale={message.payload.sale}
          selfId={selfId}
          otherHandle={otherHandle}
          onRate={onRate}
          testID={`message-${message.id}`}
        />
      );
    }
    return (
      <View style={styles.system} testID={`message-${message.id}`}>
        <Text style={[styles.systemText, { color: palette.textMuted }]}>{message.body}</Text>
      </View>
    );
  }
  const removed = message.moderationState === 'REMOVED';
  if (!removed && message.kind === 'CARD_LINK' && message.payload?.card) {
    // A shared card is its own bubble (screen 24), the text under it in an ordinary bubble.
    return (
      <View testID={`message-${message.id}`} style={own ? styles.ownStack : styles.otherStack}>
        <SharedLinkCard card={message.payload.card} item={message.payload.item} />
        {message.body ? (
          <View style={[styles.bubble, own ? styles.own : styles.other, bubbleColors]}>
            <Text selectable style={[styles.body, { color: textColor }]}>
              {message.body}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
  if (!removed && message.kind === 'IMAGE' && message.payload?.image) {
    return (
      <View testID={`message-${message.id}`} style={own ? styles.ownStack : styles.otherStack}>
        <Photo image={message.payload.image} sender={own ? null : otherHandle} />
        {message.body ? (
          <View style={[styles.bubble, own ? styles.own : styles.other, bubbleColors]}>
            <Text selectable style={[styles.body, { color: textColor }]}>
              {message.body}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
  let attachment = null;
  if (!removed && message.kind === 'BINDER_LINK' && message.payload?.binder) {
    attachment = <SharedLinkCard binder={message.payload.binder} />;
  }
  return (
    <View
      testID={`message-${message.id}`}
      style={[
        styles.bubble,
        own ? styles.own : styles.other,
        bubbleColors,
        message.moderationState === 'FLAGGED' && { borderColor: palette.warning, borderWidth: 1 },
      ]}
    >
      {removed ? (
        <View style={styles.removed}>
          <MaterialCommunityIcons name="cancel" size={16} color={textColor} />
          <Text style={[styles.body, styles.italic, { color: textColor }]}>
            This message was removed by moderation.
          </Text>
        </View>
      ) : (
        <>
          {attachment}
          {message.body ? (
            <Text selectable style={[styles.body, { color: textColor }]}>
              {message.body}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** A photo of an IMAGE message: API media only (ADR 0015 rules), full screen on tap. */
function Photo({ image, sender }: { image: MessageImage; sender: string | null }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = safeCardImageUrl(image.url);
  const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  const width = ratio >= 1 ? PHOTO_MAX : Math.round(PHOTO_MAX * ratio);
  const height = ratio >= 1 ? Math.round(PHOTO_MAX / ratio) : PHOTO_MAX;
  if (!url || failed) {
    return (
      <View
        testID="message-photo-unavailable"
        style={[styles.photoMissing, { backgroundColor: palette.surface }]}
      >
        <MaterialCommunityIcons name="image-off-outline" size={22} color={palette.textMuted} />
        <Text style={[styles.small, { color: palette.textMuted }]}>Photo unavailable</Text>
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={
          sender
            ? `Photo from ${sender}. Opens it full screen.`
            : 'Photo you sent. Opens it full screen.'
        }
        onPress={() => setOpen(true)}
        testID="message-photo"
      >
        <Image
          source={{ uri: url }}
          style={[styles.photo, { width, height, borderColor: palette.borderStrong }]}
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
            accessibilityLabel="Photo sent in the conversation"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the photo"
            onPress={() => setOpen(false)}
            style={[styles.viewerClose, { top: insets.top + spacing[2] }]}
            testID="message-photo-close"
          >
            <MaterialCommunityIcons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: spacing[2],
    borderRadius: 18,
  },
  own: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  other: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  ownStack: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: 6, maxWidth: '85%' },
  otherStack: { alignSelf: 'flex-start', alignItems: 'flex-start', gap: 6, maxWidth: '85%' },
  body: { fontSize: 15, lineHeight: 20 },
  small: { fontSize: 13, lineHeight: 18 },
  removed: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  italic: { fontStyle: 'italic' },
  system: { alignSelf: 'center', alignItems: 'stretch', gap: spacing[2], maxWidth: '95%' },
  offer: { alignSelf: 'stretch', gap: spacing[1] },
  systemText: { textAlign: 'center', fontSize: 13, lineHeight: 18 },
  photo: { borderRadius: 16, borderWidth: 1 },
  photoMissing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
  },
  viewer: { flex: 1, backgroundColor: PHOTO_SCRIM, justifyContent: 'center' },
  viewerImage: { flex: 1 },
  viewerClose: {
    position: 'absolute',
    right: spacing[3],
    padding: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  strong: { fontWeight: fontWeight.semibold },
});
