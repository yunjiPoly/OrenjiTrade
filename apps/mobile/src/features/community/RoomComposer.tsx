import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text, TextInput } from '@/src/components/ui/Text';
import { afterModals } from '@/src/components/ui/modalTurns';
import { BinderLinkPicker, CardLinkPicker } from '@/src/features/messages/LinkPickers';
import { photoType, type PickedPhoto } from '@/src/features/messages/messageDraft';
import { CHIP_HIT_SLOP, ROUND_HIT_SLOP } from '@/src/features/messages/MessageComposer';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';
import {
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  radius,
  spacing,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { ROOM_COMPOSER_COPY } from './communityCopy';
import {
  canPost,
  EMPTY_ROOM_DRAFT,
  POST_MAX_LENGTH,
  ROOM_PHOTOS_MAX,
  roomPhotoProblem,
  type RoomDraft,
} from './communityHelpers';

type SheetRow = 'photo' | 'card' | 'binder';

const ROWS: readonly { row: SheetRow; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { row: 'photo', icon: 'image-outline' },
  { row: 'card', icon: 'cards-outline' },
  { row: 'binder', icon: 'book-open-variant' },
];

const ROW_LABELS: Record<SheetRow, string> = {
  photo: ROOM_COMPOSER_COPY.photo,
  card: ROOM_COMPOSER_COPY.card,
  binder: ROOM_COMPOSER_COPY.binder,
};

export interface RoomComposerProps {
  /** The room's name ("Yu-Gi-Oh!"): the field is "Write to the {name} room". */
  roomName: string;
  busy: boolean;
  disabled?: boolean;
  /** Why the last post was refused (from the room). */
  error: string | null;
  /** The refusal is worth sending the same post again ("Try again": no network). */
  retryable: boolean;
  /** Resolves true when the post was published (the box then clears). */
  onPost: (draft: RoomDraft) => Promise<boolean>;
  onDismissError: () => void;
}

/**
 * The message box of a room (stage R11, mockup v50 screen 33): "+" opens "Send a photo", "Share a
 * card" and "Share a binder or deck core"; "Write to the room"; the send button turns orange with
 * text. Up to 4 photos (JPEG, PNG or WebP of 3 MB at most; the API strips their EXIF and GPS data)
 * wait in a row above the box, with a card and a binder or deck core; each can be removed. A
 * refused post keeps everything in the box; a network error offers "Try again".
 */
export function RoomComposer({
  roomName,
  busy,
  disabled = false,
  error,
  retryable,
  onPost,
  onDismissError,
}: RoomComposerProps) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState<RoomDraft>(EMPTY_ROOM_DRAFT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<'card' | 'binder' | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const sendable = !disabled && canPost(draft, busy);
  const nearLimit = draft.text.length > POST_MAX_LENGTH - 200;
  const room = ROOM_PHOTOS_MAX - draft.photos.length;

  const update = (change: Partial<RoomDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    if (error) {
      onDismissError();
    }
  };

  const choosePhotos = async () => {
    setMenuOpen(false);
    setPhotoError(null);
    if (room <= 0) {
      setPhotoError(ROOM_COMPOSER_COPY.photosFull);
      return;
    }
    // iOS presents the picker only once the sheet that asked for it has left the screen.
    await afterModals();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(ROOM_COMPOSER_COPY.photoAccess);
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        ...LIBRARY_PHOTO_OPTIONS,
        // A phone's camera photo often weighs more than 3 MB as it is: re-encoded a little on the
        // phone, it stays under the limit (the API re-encodes it again, without EXIF or GPS).
        quality: 0.7,
        allowsMultipleSelection: room > 1,
        selectionLimit: room,
        orderedSelection: true,
        exif: false,
      });
    } catch {
      setPhotoError(ROOM_COMPOSER_COPY.photoType);
      return;
    }
    if (result.canceled) {
      return;
    }
    const picked: PickedPhoto[] = [];
    let problem: string | null = null;
    for (const asset of result.assets) {
      const photo: PickedPhoto = {
        uri: asset.uri,
        mimeType: photoType(asset.mimeType, asset.fileName),
        fileName: asset.fileName ?? 'photo.jpg',
        size: typeof asset.fileSize === 'number' ? asset.fileSize : null,
        width: asset.width || null,
        height: asset.height || null,
        file: asset.file ?? null,
      };
      const refusal = roomPhotoProblem(photo);
      if (refusal) {
        problem = problem ?? refusal;
      } else if (picked.length < room) {
        picked.push(photo);
      }
    }
    setPhotoError(problem);
    if (picked.length > 0) {
      update({ photos: [...draft.photos, ...picked].slice(0, ROOM_PHOTOS_MAX) });
    }
  };

  const pick = async (row: SheetRow) => {
    if (row === 'photo') {
      await choosePhotos();
      return;
    }
    setMenuOpen(false);
    setPhotoError(null);
    await afterModals();
    setPicker(row);
  };

  const submit = async () => {
    if (!sendable) {
      return;
    }
    if (await onPost(draft)) {
      setDraft(EMPTY_ROOM_DRAFT);
      setPhotoError(null);
      setPicker(null);
    }
  };

  const hasAttachments = draft.photos.length > 0 || !!draft.card || !!draft.binder;

  return (
    <View style={styles.root} testID="room-composer">
      {picker === 'card' ? (
        <CardLinkPicker
          onPicked={(card) => {
            update({ card });
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      ) : null}
      {picker === 'binder' ? (
        <BinderLinkPicker
          onPicked={(binder) => {
            update({ binder });
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      ) : null}

      {hasAttachments ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.attachments}
          testID="room-attachments"
        >
          {draft.photos.map((photo, index) => (
            <View key={`${photo.uri}-${index}`} style={styles.thumbWrap}>
              <Image
                source={{ uri: photo.uri }}
                style={[styles.thumb, { borderColor: palette.borderStrong }]}
                contentFit="cover"
                accessible
                accessibilityLabel={ROOM_COMPOSER_COPY.photoToPost(index + 1)}
                testID={`room-attachment-photo-${index}`}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ROOM_COMPOSER_COPY.removePhoto(index + 1)}
                onPress={() =>
                  update({ photos: draft.photos.filter((_, other) => other !== index) })
                }
                hitSlop={CHIP_HIT_SLOP}
                testID={`room-attachment-photo-remove-${index}`}
                style={[styles.remove, { backgroundColor: palette.background }]}
              >
                <MaterialCommunityIcons name="close" size={16} color={palette.ink} />
              </Pressable>
            </View>
          ))}
          {draft.card ? (
            <View
              testID="room-attachment-card"
              style={[
                styles.chip,
                { borderColor: palette.borderStrong, backgroundColor: palette.surface },
              ]}
            >
              <CardImage src={draft.card.imageUrl} alt="" game={draft.card.game} size="xs" />
              <Text numberOfLines={2} style={[styles.chipText, { color: palette.ink }]}>
                {draft.card.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ROOM_COMPOSER_COPY.removeCard}
                onPress={() => update({ card: null })}
                hitSlop={8}
                testID="room-attachment-card-remove"
              >
                <MaterialCommunityIcons name="close" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ) : null}
          {draft.binder ? (
            <View
              testID="room-attachment-binder"
              style={[
                styles.chip,
                { borderColor: palette.borderStrong, backgroundColor: palette.surface },
              ]}
            >
              <MaterialCommunityIcons name="book-open-variant" size={24} color={palette.primary} />
              <Text numberOfLines={2} style={[styles.chipText, { color: palette.ink }]}>
                {draft.binder.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ROOM_COMPOSER_COPY.removeBinder}
                onPress={() => update({ binder: null })}
                hitSlop={8}
                testID="room-attachment-binder-remove"
              >
                <MaterialCommunityIcons name="close" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {photoError ? (
        <Text
          accessibilityRole="alert"
          testID="room-photo-error"
          style={[styles.note, { color: palette.danger }]}
        >
          {photoError}
        </Text>
      ) : null}
      {error ? (
        <View style={styles.errorRow}>
          <Text
            accessibilityRole="alert"
            testID="room-post-error"
            style={[styles.note, styles.grow, { color: palette.danger }]}
          >
            {error}
          </Text>
          {retryable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ROOM_COMPOSER_COPY.tryAgain}
              onPress={() => void submit()}
              disabled={busy}
              hitSlop={CHIP_HIT_SLOP}
              testID="room-post-retry"
              style={({ pressed }) => [
                styles.retry,
                { borderColor: palette.borderStrong },
                pressed && styles.pressed,
              ]}
            >
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[styles.retryLabel, { color: palette.ink }]}
              >
                {ROOM_COMPOSER_COPY.tryAgain}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ROOM_COMPOSER_COPY.attach}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => setMenuOpen(true)}
          hitSlop={ROUND_HIT_SLOP}
          testID="room-attach"
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
          value={draft.text}
          onChangeText={(text) => update({ text })}
          accessibilityLabel={ROOM_COMPOSER_COPY.field(roomName)}
          placeholder={ROOM_COMPOSER_COPY.placeholder}
          placeholderTextColor={palette.textDisabled}
          editable={!disabled}
          multiline
          maxLength={POST_MAX_LENGTH + 1}
          testID="room-input"
          // The box stays on screen with the keyboard: it follows the text size up to twice its
          // size, so the posts above it keep room at the largest sizes.
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
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
          accessibilityLabel={busy ? ROOM_COMPOSER_COPY.sending : ROOM_COMPOSER_COPY.send}
          aria-disabled={!sendable}
          aria-busy={busy}
          disabled={!sendable}
          onPress={() => void submit()}
          hitSlop={ROUND_HIT_SLOP}
          testID="room-send"
          style={({ pressed }) => [
            styles.round,
            styles.send,
            { backgroundColor: sendable ? palette.primary : palette.surfaceVariant },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name={busy ? 'progress-clock' : 'send'}
            size={19}
            color={sendable ? palette.onPrimary : palette.textDisabled}
          />
        </Pressable>
      </View>
      {nearLimit ? (
        <Text
          style={[
            styles.note,
            styles.counter,
            { color: draft.text.length > POST_MAX_LENGTH ? palette.danger : palette.warning },
          ]}
        >
          {draft.text.length > POST_MAX_LENGTH
            ? ROOM_COMPOSER_COPY.tooLong(POST_MAX_LENGTH)
            : ROOM_COMPOSER_COPY.nearLimit(draft.text.length, POST_MAX_LENGTH)}
        </Text>
      ) : hasAttachments && !draft.text.trim() ? (
        <Text style={[styles.note, { color: palette.textMuted }]} testID="room-needs-text">
          {ROOM_COMPOSER_COPY.needsText}
        </Text>
      ) : null}

      <BottomSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={ROOM_COMPOSER_COPY.sheetTitle}
        testID="room-attach-sheet"
      >
        {/* The rows scroll at the largest text sizes; Cancel stays on screen under them. */}
        <ScrollView style={styles.sheetScroll} bounces={false}>
          {ROWS.map(({ row, icon }) => (
            <Pressable
              key={row}
              accessibilityRole="button"
              accessibilityLabel={ROW_LABELS[row]}
              accessibilityHint={row === 'photo' ? ROOM_COMPOSER_COPY.photoDetail : undefined}
              onPress={() => void pick(row)}
              testID={`room-attach-${row}`}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name={icon}
                size={22}
                color={palette.ink}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <View style={styles.grow}>
                <Text style={[styles.sheetLabel, { color: palette.ink }]}>{ROW_LABELS[row]}</Text>
                {row === 'photo' ? (
                  <Text style={[styles.sheetDetail, { color: palette.textMuted }]}>
                    {ROOM_COMPOSER_COPY.photoDetail}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ROOM_COMPOSER_COPY.cancel}
          onPress={() => setMenuOpen(false)}
          testID="room-attach-cancel"
          style={({ pressed }) => [
            styles.cancel,
            { borderColor: palette.borderStrong },
            pressed && styles.pressed,
          ]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.cancelLabel, { color: palette.ink }]}
          >
            {ROOM_COMPOSER_COPY.cancel}
          </Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  grow: { flex: 1 },
  attachments: { gap: spacing[2], paddingVertical: 2 },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1 },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    maxWidth: 240,
    minHeight: 64,
    paddingHorizontal: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  chipText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  retry: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
  },
  retryLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
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
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 52,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
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
