import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { useDeleteItemPhoto, useUploadItemPhoto } from '@/src/api/hooks/inventory';
import type { InventoryItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { SectionCard } from '@/src/components/ui/Layout';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  ITEM_PHOTO_HINT,
  ITEM_PHOTO_MAX_COUNT,
  ITEM_PHOTO_TYPE_MESSAGE,
  itemPhotoErrorMessage,
  itemPhotoProblem,
  photoMimeType,
} from './itemPhotoRules';

/**
 * Owner photos of an item (the web's `app-item-photos`): up to four thumbnails, each removable,
 * and "Add photo" from the library (JPEG / PNG / WebP up to 8 MB, checked before the upload; the
 * API re-encodes it without metadata). The camera is not used (card scanning is on hold).
 */
export function ItemPhotos({
  item,
  disabled = false,
}: {
  item: InventoryItemResponse;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const upload = useUploadItemPhoto();
  const remove = useDeleteItemPhoto();
  const [problem, setProblem] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const busy = upload.isPending || remove.isPending || disabled;
  const canAdd = item.images.length < ITEM_PHOTO_MAX_COUNT;

  const add = async () => {
    setProblem(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setProblem('Allow access to your photos to add one.');
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
    } catch {
      // The web picker refuses a file that is not an image before the app sees it.
      setProblem(ITEM_PHOTO_TYPE_MESSAGE);
      return;
    }
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) {
      return;
    }
    const photo = {
      uri: asset.uri,
      mimeType: photoMimeType(asset.mimeType, asset.fileName),
      fileName: asset.fileName ?? 'card.jpg',
      size: typeof asset.fileSize === 'number' ? asset.fileSize : null,
      file: asset.file ?? null,
    };
    const refusal = itemPhotoProblem(photo);
    if (refusal) {
      setProblem(refusal);
      return;
    }
    try {
      await upload.mutateAsync({ id: item.id, photo });
    } catch (error) {
      setProblem(itemPhotoErrorMessage(error as ApiError));
    }
  };

  const drop = async (imageId: string) => {
    setProblem(null);
    setRemovingId(imageId);
    try {
      await remove.mutateAsync({ id: item.id, imageId });
    } catch (error) {
      setProblem(itemPhotoErrorMessage(error as ApiError));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <SectionCard title="Your photos" testID="item-photos">
      <View style={styles.grid} accessibilityLabel="Photos">
        {item.images.map((image, index) => {
          const url = safeCardImageUrl(image.url);
          return (
            <View
              key={image.id}
              testID={`item-photo-${image.id}`}
              style={[styles.tile, { backgroundColor: palette.surfaceVariant }]}
            >
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityLabel={`Photo ${index + 1}`}
                />
              ) : (
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={24}
                  color={palette.textMuted}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                disabled={busy}
                onPress={() => void drop(image.id)}
                hitSlop={6}
                testID={`item-photo-${image.id}-remove`}
                style={[styles.remove, removingId === image.id && styles.removing]}
              >
                <MaterialCommunityIcons name="close" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          );
        })}
        {canAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={upload.isPending ? 'Uploading the photo' : 'Add photo'}
            aria-busy={upload.isPending}
            disabled={busy}
            onPress={() => void add()}
            testID="item-photo-add"
            style={({ pressed }) => [
              styles.tile,
              styles.add,
              { borderColor: palette.borderStrong },
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <MaterialCommunityIcons
              name={upload.isPending ? 'timer-sand' : 'camera-plus-outline'}
              size={24}
              color={palette.textMuted}
            />
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {upload.isPending ? 'Uploading…' : 'Add photo'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{ITEM_PHOTO_HINT}</Text>
      {problem ? (
        <Text
          accessibilityRole="alert"
          testID="item-photo-error"
          style={[textStyle('sm'), { color: palette.danger }]}
        >
          {problem}
        </Text>
      ) : null}
      {upload.isPending ? (
        <Button label="Uploading…" loading loadingLabel="Uploading the photo…" variant="ghost" />
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  tile: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: { borderWidth: 2, borderStyle: 'dashed', gap: 2 },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removing: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
