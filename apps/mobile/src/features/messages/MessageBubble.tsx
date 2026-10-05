import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MessageImage, MessageResponse } from '@/src/api/types';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { OfferLinkCard, SharedLinkCard } from './LinkCards';

/** Largest photo side in a bubble (dp). */
const PHOTO_MAX = 240;

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}

/**
 * One message (the web's `app-message-bubble`): text, a shared card or binder (with an optional
 * caption), a photo (tap to view it full screen), an offer card, or a system line (offer and
 * trade updates carry the offer card too). Removed messages keep their place with a neutral note.
 */
export function MessageBubble({
  message,
  own,
  showTime,
}: {
  message: MessageResponse;
  own: boolean;
  showTime: boolean;
}) {
  const { palette } = useTheme();
  if (message.kind === 'SYSTEM') {
    return (
      <View style={styles.system} testID={`message-${message.id}`}>
        <Text style={[textStyle('sm'), styles.systemText, { color: palette.textMuted }]}>
          {message.body}
        </Text>
        {message.payload?.offer ? <OfferLinkCard offer={message.payload.offer} /> : null}
      </View>
    );
  }
  const removed = message.moderationState === 'REMOVED';
  const textColor = own ? palette.onPrimary : palette.ink;
  let attachment = null;
  if (!removed) {
    switch (message.kind) {
      case 'CARD_LINK':
        attachment = message.payload?.card ? <SharedLinkCard card={message.payload.card} /> : null;
        break;
      case 'BINDER_LINK':
        attachment = message.payload?.binder ? (
          <SharedLinkCard binder={message.payload.binder} />
        ) : null;
        break;
      case 'IMAGE':
        attachment = message.payload?.image ? <Photo image={message.payload.image} /> : null;
        break;
      case 'OFFER_LINK':
        attachment = message.payload?.offer ? (
          <OfferLinkCard offer={message.payload.offer} />
        ) : null;
        break;
      default:
        break;
    }
  }
  return (
    <View
      testID={`message-${message.id}`}
      style={[
        styles.bubble,
        own
          ? [styles.own, { backgroundColor: palette.primary }]
          : [styles.other, { backgroundColor: palette.surfaceVariant }],
        message.moderationState === 'FLAGGED' && { borderColor: palette.warning, borderWidth: 1 },
      ]}
    >
      {removed ? (
        <View style={styles.removed}>
          <MaterialCommunityIcons name="cancel" size={16} color={textColor} />
          <Text style={[textStyle('md'), styles.italic, { color: textColor }]}>
            This message was removed by moderation.
          </Text>
        </View>
      ) : (
        <>
          {attachment}
          {message.body ? (
            <Text selectable style={[textStyle('md'), { color: textColor }]}>
              {message.body}
            </Text>
          ) : null}
        </>
      )}
      {showTime ? (
        <Text style={[textStyle('xs'), styles.time, { color: textColor }]}>
          {timeLabel(message.createdAt)}
          {message.editedAt ? ' · edited' : ''}
        </Text>
      ) : null}
    </View>
  );
}

/** A photo of an IMAGE message: API media only (ADR 0015 rules), full screen on tap. */
function Photo({ image }: { image: MessageImage }) {
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
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>Photo unavailable</Text>
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel="Photo sent in the conversation. Opens it full screen."
        onPress={() => setOpen(true)}
        testID="message-photo"
      >
        <Image
          source={{ uri: url }}
          style={[styles.photo, { width, height }]}
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
    maxWidth: '85%',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
    borderRadius: 18,
  },
  own: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  other: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  time: { alignSelf: 'flex-end', opacity: 0.75 },
  removed: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  italic: { fontStyle: 'italic' },
  system: { alignSelf: 'center', alignItems: 'stretch', gap: spacing[2], maxWidth: '95%' },
  systemText: { textAlign: 'center' },
  photo: { borderRadius: radius.md },
  photoMissing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
  },
  viewer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', justifyContent: 'center' },
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
