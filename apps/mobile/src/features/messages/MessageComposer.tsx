import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState, type ElementRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text, TextInput } from '@/src/components/ui/Text';
import { afterModals } from '@/src/components/ui/modalTurns';
import { SavedDetailSheet } from '@/src/features/shipping/SavedDetailSheet';
import { useSavedDetails, type SavedDetailKind } from '@/src/features/shipping/savedDetails';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';
import { fontWeight, PINNED_MAX_FONT_SCALE, radius, spacing, useTheme } from '@/src/theme';

import { COMPOSER_COPY, QUICK_REPLIES, SAVED_DETAIL_COPY } from './chatCopy';
import { attachRows, type AttachRow, type DealSide } from './dealRules';
import { BinderLinkPicker } from './LinkPickers';
import {
  fileSizeLabel,
  imageProblem,
  photoType,
  type DraftAttachment,
  type MessageDraft,
  type PickedPhoto,
} from './messageDraft';
import { MESSAGE_MAX_LENGTH } from './messageText';
import { OwnCardPicker } from './OwnCardPicker';

export interface MessageComposerProps {
  /** Sending in progress. */
  busy: boolean;
  /** The conversation cannot receive messages (blocked, unavailable). */
  disabled: boolean;
  /** Why the last send failed (from the thread). */
  error: string | null;
  placeholder: string;
  /** Which side of the deal the reader is on (the "+" sheet's first rows). */
  side: DealSide;
  /** The quick replies to offer (one tap sends). */
  quickReplies: readonly string[];
  /** Resolves true when the message was accepted (the composer then clears). */
  onSend: (draft: MessageDraft) => Promise<boolean>;
  /** The caller typed (throttled by the thread before it reaches the server). */
  onTyping: () => void;
  onDismissError: () => void;
}

const ROW_ICONS: Record<AttachRow, keyof typeof MaterialCommunityIcons.glyphMap> = {
  address: 'map-marker-outline',
  etransfer: 'email-outline',
  photo: 'image-outline',
  card: 'cards-outline',
  binder: 'book-open-variant',
};

const ROW_LABELS: Record<AttachRow, string> = {
  address: COMPOSER_COPY.address,
  etransfer: COMPOSER_COPY.etransfer,
  photo: COMPOSER_COPY.photo,
  card: COMPOSER_COPY.card,
  binder: COMPOSER_COPY.binder,
};

const ROW_IDS: Record<AttachRow, string> = {
  address: 'composer-send-address',
  etransfer: 'composer-send-etransfer',
  photo: 'composer-attach-photo',
  card: 'composer-share-card',
  binder: 'composer-share-binder',
};

/**
 * The message box of a chat (owner spec 2026-10-14, section 10, mockup screens 23 and 24): the
 * quick replies in one sideways row (one tap sends), then "+", the "Message" field and the send
 * button, orange once there is something to send. The "+" sheet: "Send my address" (buying) or
 * "Send my e-Transfer email" (selling; both in a chat without a card), each "Saved on this phone
 * only" and asked for the first time; "Send a photo"; "Share a card from your inventory"; "Share a
 * binder"; "Cancel". A saved detail goes into the message box to be checked, never sent by itself.
 * The thread decides whether a send worked.
 */
export function MessageComposer({
  busy,
  disabled,
  error,
  placeholder,
  side,
  quickReplies,
  onSend,
  onTyping,
  onDismissError,
}: MessageComposerProps) {
  const { palette } = useTheme();
  const input = useRef<ElementRef<typeof TextInput>>(null);
  const saved = useSavedDetails();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<DraftAttachment | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [binderPicker, setBinderPicker] = useState(false);
  const [cardPicker, setCardPicker] = useState(false);
  const [asking, setAsking] = useState<SavedDetailKind | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const nearLimit = text.length > MESSAGE_MAX_LENGTH - 200;
  const canSend =
    !busy &&
    !disabled &&
    (text.trim().length > 0 || !!attachment) &&
    text.length <= MESSAGE_MAX_LENGTH;

  /** Puts a saved detail into the message box (after what is there), to be checked first. */
  const insert = (kind: SavedDetailKind, value: string) => {
    const line =
      kind === 'address'
        ? SAVED_DETAIL_COPY.addressMessage(value)
        : SAVED_DETAIL_COPY.etransferMessage(value);
    setText((current) => (current.trim() ? `${current.trimEnd()}\n${line}` : line));
    setTimeout(() => input.current?.focus(), 0);
  };

  const applyDetail = async (kind: SavedDetailKind) => {
    setMenuOpen(false);
    const value = kind === 'address' ? saved.address : saved.etransfer;
    await afterModals();
    if (value) {
      insert(kind, value);
    } else {
      setAsking(kind);
    }
  };

  const choosePhoto = async () => {
    setMenuOpen(false);
    setFileError(null);
    // iOS puts the photo picker on top of whatever is on screen: opened while the sheet is still
    // sliding away, it went away with the sheet and the row seemed to do nothing.
    await afterModals();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFileError(COMPOSER_COPY.photoAccess);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      ...LIBRARY_PHOTO_OPTIONS,
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
    setBinderPicker(false);
    setAttachment({ kind: 'image', photo });
  };

  const pick = async (row: AttachRow) => {
    switch (row) {
      case 'address':
      case 'etransfer':
        await applyDetail(row);
        return;
      case 'photo':
        await choosePhoto();
        return;
      case 'card':
        setMenuOpen(false);
        setFileError(null);
        await afterModals();
        setCardPicker(true);
        return;
      case 'binder':
        setMenuOpen(false);
        setFileError(null);
        setBinderPicker(true);
        return;
    }
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

  const sendQuickReply = async (reply: string) => {
    if (busy || disabled) {
      return;
    }
    await onSend({ text: reply, attachment: null });
  };

  return (
    <View style={styles.root} testID="message-composer">
      {binderPicker ? (
        <BinderLinkPicker
          onPicked={(binder) => {
            setAttachment({ kind: 'binder', binder });
            setBinderPicker(false);
          }}
          onCancel={() => setBinderPicker(false)}
        />
      ) : null}

      {quickReplies.length > 0 && !disabled ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel={QUICK_REPLIES.label}
          contentContainerStyle={styles.quickRow}
          style={styles.quick}
          testID="quick-replies"
        >
          {quickReplies.map((reply) => (
            <Pressable
              key={reply}
              accessibilityRole="button"
              accessibilityLabel={QUICK_REPLIES.send(reply)}
              disabled={busy}
              onPress={() => void sendQuickReply(reply)}
              testID={`quick-reply-${reply}`}
              style={({ pressed }) => [
                styles.quickChip,
                { borderColor: palette.borderStrong, backgroundColor: palette.surface },
                pressed && styles.pressed,
              ]}
            >
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[styles.quickLabel, { color: palette.ink }]}
              >
                {reply}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
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
            accessibilityLabel={COMPOSER_COPY.removeAttachment}
            onPress={() => setAttachment(null)}
            hitSlop={8}
            testID="composer-attachment-remove"
          >
            <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {fileError ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: palette.danger }]}>
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
          <Text style={[styles.note, { color: palette.danger }]}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COMPOSER_COPY.attach}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => setMenuOpen(true)}
          testID="composer-attach"
          style={({ pressed }) => [
            styles.round,
            { borderColor: palette.borderStrong, backgroundColor: palette.surface },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <MaterialCommunityIcons name="plus" size={22} color={palette.ink} />
        </Pressable>
        <TextInput
          ref={input}
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
          accessibilityLabel={COMPOSER_COPY.placeholder}
          placeholder={placeholder}
          placeholderTextColor={palette.textDisabled}
          editable={!disabled}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          testID="conversation-input"
          style={[
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
          accessibilityLabel={busy ? COMPOSER_COPY.sending : COMPOSER_COPY.send}
          aria-disabled={!canSend}
          aria-busy={busy}
          disabled={!canSend}
          onPress={() => void submit()}
          testID="conversation-send"
          style={({ pressed }) => [
            styles.round,
            styles.send,
            { backgroundColor: canSend ? palette.primary : palette.surfaceVariant },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name={busy ? 'progress-clock' : 'send'}
            size={19}
            color={canSend ? palette.onPrimary : palette.textDisabled}
          />
        </Pressable>
      </View>
      {nearLimit ? (
        <Text style={[styles.note, styles.counter, { color: palette.warning }]}>
          {COMPOSER_COPY.nearLimit(text.length, MESSAGE_MAX_LENGTH)}
        </Text>
      ) : null}

      <BottomSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        testID="composer-attach-sheet"
      >
        {attachRows(side).map((row) => {
          const savedOnPhone = row === 'address' || row === 'etransfer';
          return (
            <Pressable
              key={row}
              accessibilityRole="button"
              accessibilityLabel={ROW_LABELS[row]}
              accessibilityHint={
                savedOnPhone
                  ? COMPOSER_COPY.savedOnPhone
                  : row === 'photo'
                    ? COMPOSER_COPY.photoDetail
                    : undefined
              }
              onPress={() => void pick(row)}
              testID={ROW_IDS[row]}
              style={({ pressed }) => [
                styles.sheetRow,
                savedOnPhone && styles.sheetRowTall,
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons name={ROW_ICONS[row]} size={22} color={palette.ink} />
              <View style={styles.sheetText}>
                <Text style={[styles.sheetLabel, { color: palette.ink }]}>{ROW_LABELS[row]}</Text>
                {savedOnPhone ? (
                  <Text style={[styles.sheetDetail, { color: palette.textMuted }]}>
                    {COMPOSER_COPY.savedOnPhone}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COMPOSER_COPY.cancel}
          onPress={() => setMenuOpen(false)}
          testID="composer-attach-cancel"
          style={({ pressed }) => [
            styles.cancel,
            { borderColor: palette.borderStrong },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.cancelLabel, { color: palette.ink }]}>{COMPOSER_COPY.cancel}</Text>
        </Pressable>
      </BottomSheet>

      <OwnCardPicker
        visible={cardPicker}
        onClose={() => setCardPicker(false)}
        onPicked={(item) => {
          setCardPicker(false);
          setAttachment({ kind: 'item', item });
        }}
      />
      <SavedDetailSheet
        kind={asking}
        onClose={() => setAsking(null)}
        onSave={async (kind, value) => {
          const stored = await saved.save(kind, value);
          setAsking(null);
          if (stored) {
            await afterModals();
            insert(kind, stored);
          }
        }}
      />
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
    case 'item':
      thumb = (
        <CardImage src={attachment.item.imageUrl} alt="" game={attachment.item.game} size="xs" />
      );
      eyebrow = COMPOSER_COPY.attachmentCard;
      name = attachment.item.name;
      meta =
        [attachment.item.printingCode, attachment.item.askingPriceText]
          .filter(Boolean)
          .join(' · ') || null;
      break;
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
      eyebrow = COMPOSER_COPY.attachmentBinder;
      name = attachment.binder.name;
      break;
    case 'image':
      thumb = (
        <Image
          source={{ uri: attachment.photo.uri }}
          style={styles.thumb}
          contentFit="cover"
          accessible
          accessibilityLabel={COMPOSER_COPY.photoToSend}
        />
      );
      eyebrow = COMPOSER_COPY.attachmentPhoto;
      name = attachment.photo.fileName;
      meta = fileSizeLabel(attachment.photo.size) || null;
      break;
  }
  return (
    <View style={styles.preview}>
      {thumb}
      <View style={styles.grow}>
        <Text style={[styles.eyebrow, { color: palette.textMuted }]}>{eyebrow}</Text>
        <Text numberOfLines={1} style={[styles.previewName, { color: palette.ink }]}>
          {name}
        </Text>
        {meta ? <Text style={[styles.eyebrow, { color: palette.textMuted }]}>{meta}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  quick: { marginHorizontal: -12 },
  quickRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 2 },
  quickChip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: { borderWidth: 0 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 21,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    lineHeight: 21,
  },
  note: { fontSize: 13, lineHeight: 18 },
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
  eyebrow: { fontSize: 12, lineHeight: 16 },
  previewName: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 52,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  sheetRowTall: { minHeight: 60 },
  sheetText: { flex: 1, gap: 2 },
  sheetLabel: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.medium },
  sheetDetail: { fontSize: 12, lineHeight: 16 },
  cancel: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  cancelLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
