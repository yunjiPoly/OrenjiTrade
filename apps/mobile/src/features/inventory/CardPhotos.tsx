import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ListRow } from '@/src/components/ui/Layout';
import { Text } from '@/src/components/ui/Text';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { CARD_FORM_COPY } from './inventoryCopy';
import type { LocalPhoto } from './inventoryUiStore';
import { ITEM_PHOTO_MAX_COUNT } from './itemPhotoRules';
import { pickFromLibrary, takeWithCamera, type PickResult } from './pickCardPhotos';

/** A photo of the form: one on the server, or one picked on the phone and not uploaded yet. */
export type PhotoTile =
  | { kind: 'saved'; key: string; id: string; url: string }
  | { kind: 'local'; key: string; photo: LocalPhoto; state: 'waiting' | 'uploading' | 'failed' };

export interface CardPhotosProps {
  tiles: readonly PhotoTile[];
  onAdd: (photos: LocalPhoto[]) => void;
  onRemove: (key: string) => void;
  /** "{n} photos weren't saved. Try again.": the failed photos are uploaded again. */
  onRetry?: () => void;
  disabled?: boolean;
  /** The label of the add tile: "Add photos" while adding, "Add" on Edit card (the mockup). */
  addLabel?: string;
}

/**
 * Photos of a card (owner spec 2026-10-14, section 6): "{n} / 4", up to four tiles, the add tile
 * (library or camera), the hint, and the photos that could not be saved with "Try again". The
 * screen decides when they are uploaded (after the card is created, or with "Save changes").
 */
export function CardPhotos({
  tiles,
  onAdd,
  onRemove,
  onRetry,
  disabled = false,
  addLabel = CARD_FORM_COPY.addPhotos,
}: CardPhotosProps) {
  const { palette } = useTheme();
  const [choosing, setChoosing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const room = ITEM_PHOTO_MAX_COUNT - tiles.length;
  const failed = tiles.filter((tile) => tile.kind === 'local' && tile.state === 'failed').length;

  const take = async (pick: (room: number) => Promise<PickResult>) => {
    setChoosing(false);
    setProblem(null);
    const result = await pick(room);
    if (result.photos.length > 0) {
      onAdd(result.photos);
    }
    setProblem(result.problem);
  };

  const add = () => {
    // The web has no camera to offer here: its file picker opens at once.
    if (Platform.OS === 'web') {
      void take(pickFromLibrary);
    } else {
      setChoosing(true);
    }
  };

  return (
    <View style={styles.root} testID="card-photos">
      <View style={styles.head}>
        <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
          {CARD_FORM_COPY.photos}
        </Text>
        <Text
          testID="card-photos-count"
          style={[textStyle('sm'), { color: palette.textMuted }]}
          accessibilityLabel={`${tiles.length} of ${ITEM_PHOTO_MAX_COUNT} photos`}
        >
          {CARD_FORM_COPY.counter(tiles.length, ITEM_PHOTO_MAX_COUNT)}
        </Text>
      </View>
      <View style={styles.grid}>
        {tiles.map((tile, index) => (
          <Tile
            key={tile.key}
            tile={tile}
            index={index + 1}
            disabled={disabled}
            onRemove={() => onRemove(tile.key)}
          />
        ))}
        {room > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={CARD_FORM_COPY.addPhotos}
            disabled={disabled}
            onPress={add}
            testID="card-photos-add"
            style={({ pressed }) => [
              styles.tile,
              styles.addTile,
              { borderColor: palette.primary },
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <MaterialCommunityIcons name="image-plus" size={22} color={palette.primary} />
            <Text style={[styles.addLabel, { color: palette.primary }]}>{addLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        {CARD_FORM_COPY.photosHint}
      </Text>
      {failed > 0 ? (
        <View
          testID="card-photos-failed"
          style={[styles.failed, { borderColor: palette.danger }]}
          accessibilityLiveRegion="polite"
        >
          <Text
            accessibilityRole="alert"
            style={[textStyle('sm'), styles.grow, { color: palette.ink }]}
          >
            {CARD_FORM_COPY.photoFailed(failed)}
          </Text>
          {onRetry ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={CARD_FORM_COPY.tryAgain}
              disabled={disabled}
              onPress={onRetry}
              testID="card-photos-retry"
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={[textStyle('sm'), styles.retryLabel, { color: palette.primary }]}>
                {CARD_FORM_COPY.tryAgain}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {problem ? (
        <Text
          accessibilityRole="alert"
          testID="card-photos-problem"
          style={[textStyle('sm'), { color: palette.danger }]}
        >
          {problem}
        </Text>
      ) : null}
      <BottomSheet
        visible={choosing}
        onClose={() => setChoosing(false)}
        title={CARD_FORM_COPY.photoSourceTitle}
        testID="card-photos-source"
      >
        <ListRow
          icon="image-multiple-outline"
          label={CARD_FORM_COPY.chooseFromLibrary}
          kind="button"
          onPress={() => void take(pickFromLibrary)}
          testID="card-photos-library"
        />
        <ListRow
          icon="camera-outline"
          label={CARD_FORM_COPY.takePhoto}
          kind="button"
          onPress={() => void take(takeWithCamera)}
          testID="card-photos-camera"
        />
        <ListRow
          icon="close"
          label={CARD_FORM_COPY.cancel}
          kind="button"
          onPress={() => setChoosing(false)}
          testID="card-photos-cancel"
        />
      </BottomSheet>
    </View>
  );
}

function Tile({
  tile,
  index,
  disabled,
  onRemove,
}: {
  tile: PhotoTile;
  index: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { palette } = useTheme();
  const uri = tile.kind === 'saved' ? safeCardImageUrl(tile.url) : tile.photo.uri;
  const failed = tile.kind === 'local' && tile.state === 'failed';
  const uploading = tile.kind === 'local' && tile.state === 'uploading';
  return (
    <View
      testID={`card-photo-${index}`}
      style={[
        styles.tile,
        {
          backgroundColor: palette.surfaceVariant,
          borderColor: failed ? palette.danger : palette.borderStrong,
          borderWidth: failed ? 2 : 1,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityLabel={
            failed
              ? `${CARD_FORM_COPY.photo(index)}, ${CARD_FORM_COPY.photoNotSaved}`
              : CARD_FORM_COPY.photo(index)
          }
        />
      ) : (
        <MaterialCommunityIcons name="image-off-outline" size={22} color={palette.textMuted} />
      )}
      {uploading ? (
        <View style={styles.veil}>
          <ActivityIndicator color="#FFFFFF" accessibilityLabel={CARD_FORM_COPY.uploading} />
        </View>
      ) : null}
      {failed ? (
        <View style={[styles.badge, { backgroundColor: palette.danger }]}>
          <MaterialCommunityIcons name="alert" size={12} color="#FFFFFF" />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CARD_FORM_COPY.removePhoto(index)}
        disabled={disabled || uploading}
        onPress={onRemove}
        hitSlop={10}
        testID={`card-photo-${index}-remove`}
        style={styles.remove}
      >
        <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: fontWeight.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  tile: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', gap: 4 },
  addLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold, textAlign: 'center' },
  remove: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(28, 25, 23, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  veil: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(28, 25, 23, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    paddingVertical: spacing[1],
  },
  grow: { flex: 1, minWidth: 160 },
  retry: { minHeight: 44, paddingHorizontal: spacing[2], justifyContent: 'center' },
  retryLabel: { fontWeight: fontWeight.bold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
