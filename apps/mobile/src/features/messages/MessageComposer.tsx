import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { CardImage } from '@/src/components/ui/CardImage';
import { ListRow } from '@/src/components/ui/Layout';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { BinderLinkPicker, CardLinkPicker, OfferLinkPicker } from './LinkPickers';
import {
  fileSizeLabel,
  imageProblem,
  photoType,
  type DraftAttachment,
  type MessageDraft,
  type PickedPhoto,
} from './messageDraft';
import { MESSAGE_MAX_LENGTH } from './messageText';

type Picker = 'card' | 'binder' | 'offer' | null;

export interface MessageComposerProps {
  /** Sending in progress. */
  busy: boolean;
  /** The conversation cannot receive messages (blocked, unavailable). */
  disabled: boolean;
  /** Why the last send failed (from the thread). */
  error: string | null;
  placeholder: string;
  /** Resolves true when the message was accepted (the composer then clears). */
  onSend: (draft: MessageDraft) => Promise<boolean>;
  /** The caller typed (throttled by the thread before it reaches the server). */
  onTyping: () => void;
  onDismissError: () => void;
  /** The other participant ("Share an offer" lists the negotiations with them). */
  otherId?: string | null;
  otherName?: string;
}

/**
 * Message composer (the web's `app-message-composer`): multi-line text, an attachment menu
 * (share a card, one of the caller's public binders or a negotiation with the other collector
 * through an inline picker, or attach a photo from the library with a preview and type / size
 * checks) and the send button. It only hands drafts to the thread, which decides whether the send
 * worked.
 */
export function MessageComposer({
  busy,
  disabled,
  error,
  placeholder,
  onSend,
  onTyping,
  onDismissError,
  otherId = null,
  otherName = 'this collector',
}: MessageComposerProps) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<DraftAttachment | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const nearLimit = text.length > MESSAGE_MAX_LENGTH - 200;
  const canSend =
    !busy &&
    !disabled &&
    (text.trim().length > 0 || !!attachment) &&
    text.length <= MESSAGE_MAX_LENGTH;

  const choosePhoto = async () => {
    setMenuOpen(false);
    setFileError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFileError('Allow access to your photos to attach one.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) {
      return;
    }
    const photo: PickedPhoto = {
      uri: asset.uri,
      mimeType: photoType(asset.mimeType, asset.fileName),
      fileName: asset.fileName ?? 'photo.jpg',
      size: typeof asset.fileSize === 'number' ? asset.fileSize : null,
      width: asset.width || null,
      height: asset.height || null,
      file: asset.file ?? null,
    };
    const problem = imageProblem(photo);
    if (problem) {
      setFileError(problem);
      return;
    }
    setPicker(null);
    setAttachment({ kind: 'image', photo });
  };

  const submit = async () => {
    if (!canSend) {
      return;
    }
    if (await onSend({ text, attachment })) {
      setText('');
      setAttachment(null);
      setFileError(null);
    }
  };

  return (
    <View style={styles.root} testID="message-composer">
      {picker === 'card' ? (
        <CardLinkPicker
          onPicked={(card) => {
            setAttachment({ kind: 'card', card });
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      ) : null}
      {picker === 'offer' && otherId ? (
        <OfferLinkPicker
          otherId={otherId}
          otherName={otherName}
          onPicked={(offer) => {
            setAttachment({ kind: 'offer', offer });
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      ) : null}
      {picker === 'binder' ? (
        <BinderLinkPicker
          onPicked={(binder) => {
            setAttachment({ kind: 'binder', binder });
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      ) : null}

      {attachment ? (
        <View
          testID="composer-attachment"
          style={[
            styles.attachment,
            { borderColor: palette.border, backgroundColor: palette.surfaceVariant },
          ]}
        >
          <AttachmentPreview attachment={attachment} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
            onPress={() => setAttachment(null)}
            hitSlop={8}
            testID="composer-attachment-remove"
          >
            <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {fileError ? (
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          {fileError}
        </Text>
      ) : null}
      {error ? (
        <Pressable
          accessibilityRole="alert"
          accessibilityHint="Tap to dismiss"
          onPress={onDismissError}
          testID="conversation-send-error"
        >
          <Text style={[textStyle('sm'), { color: palette.danger }]}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a card, binder, offer or photo"
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => setMenuOpen(true)}
          hitSlop={6}
          testID="composer-attach"
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={26} color={palette.accent} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (value) {
              onTyping();
            }
            if (error) {
              onDismissError();
            }
          }}
          accessibilityLabel="Message"
          placeholder={placeholder}
          placeholderTextColor={palette.textDisabled}
          editable={!disabled}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          testID="conversation-input"
          style={[
            textStyle('md'),
            styles.input,
            {
              color: palette.ink,
              borderColor: palette.borderStrong,
              backgroundColor: palette.surface,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Sending…' : 'Send message'}
          aria-disabled={!canSend}
          aria-busy={busy}
          disabled={!canSend}
          onPress={() => void submit()}
          testID="conversation-send"
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? palette.primary : palette.surfaceVariant },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name={busy ? 'progress-clock' : 'send'}
            size={22}
            color={canSend ? palette.onPrimary : palette.textDisabled}
          />
        </Pressable>
      </View>
      {nearLimit ? (
        <Text style={[textStyle('xs'), styles.counter, { color: palette.warning }]}>
          {text.length} / {MESSAGE_MAX_LENGTH} characters
        </Text>
      ) : null}

      <BottomSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Attach"
        testID="composer-attach-sheet"
      >
        <ListRow
          icon="cards-outline"
          label="Share a card"
          kind="button"
          onPress={() => {
            setMenuOpen(false);
            setFileError(null);
            setPicker('card');
          }}
          testID="composer-share-card"
        />
        <ListRow
          icon="book-open-variant"
          label="Share a binder"
          kind="button"
          onPress={() => {
            setMenuOpen(false);
            setFileError(null);
            setPicker('binder');
          }}
          testID="composer-share-binder"
        />
        {otherId ? (
          <ListRow
            icon="tag-outline"
            label="Share an offer"
            detail={`A negotiation with ${otherName}`}
            kind="button"
            onPress={() => {
              setMenuOpen(false);
              setFileError(null);
              setPicker('offer');
            }}
            testID="composer-share-offer"
          />
        ) : null}
        <ListRow
          icon="image-plus"
          label="Attach a photo"
          detail="JPEG, PNG or WebP, up to 8 MB"
          kind="button"
          onPress={() => void choosePhoto()}
          testID="composer-attach-photo"
        />
      </BottomSheet>
    </View>
  );
}

function AttachmentPreview({ attachment }: { attachment: DraftAttachment }) {
  const { palette } = useTheme();
  let thumb;
  let eyebrow: string;
  let name: string;
  let meta: string | null = null;
  switch (attachment.kind) {
    case 'card':
      thumb = (
        <CardImage src={attachment.card.imageUrl} alt="" game={attachment.card.game} size="xs" />
      );
      eyebrow = 'Card';
      name = attachment.card.name;
      meta = attachment.card.printingCode;
      break;
    case 'binder':
      thumb = <MaterialCommunityIcons name="book-open-variant" size={28} color={palette.primary} />;
      eyebrow = 'Public binder';
      name = attachment.binder.name;
      break;
    case 'offer':
      thumb = (
        <CardImage src={attachment.offer.imageUrl} alt="" game={attachment.offer.game} size="xs" />
      );
      eyebrow = 'Offer';
      name = attachment.offer.cardName;
      meta = attachment.offer.terms;
      break;
    case 'image':
      thumb = (
        <Image
          source={{ uri: attachment.photo.uri }}
          style={styles.thumb}
          contentFit="cover"
          accessible
          accessibilityLabel="Photo to send"
        />
      );
      eyebrow = 'Photo';
      name = attachment.photo.fileName;
      meta = fileSizeLabel(attachment.photo.size) || null;
      break;
  }
  return (
    <View style={styles.preview}>
      {thumb}
      <View style={styles.grow}>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{eyebrow}</Text>
        <Text numberOfLines={1} style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
          {name}
        </Text>
        {meta ? <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{meta}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  iconButton: { paddingBottom: 9 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingTop: 10,
    paddingBottom: 10,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { alignSelf: 'flex-end' },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  preview: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  thumb: { width: 48, height: 48, borderRadius: radius.sm },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
