import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { useDeleteAvatar, useUploadAvatar } from '@/src/api/hooks/profile';
import { Avatar } from '@/src/components/ui/Avatar';
import { FormMessage } from '@/src/components/ui/FormControls';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { EDIT_PROFILE_COPY as COPY } from '@/src/features/settings/settingsCopy';
import { LIBRARY_PHOTO_OPTIONS } from '@/src/lib/photoPicker';
import { fontWeight, spacing, useTheme } from '@/src/theme';

export interface AvatarEditorProps {
  avatarUrl: string | null | undefined;
  name: string | null | undefined;
  disabled?: boolean;
}

/**
 * The picture of Edit profile (mockup v50 screen 48): the 72 pt avatar, "Add a picture" or
 * "Change picture" (square crop) and "Remove picture", the line on where it shows. It is saved at
 * once, apart from "Save changes" (JPEG, PNG or WebP up to 5 MB; the API strips its metadata).
 */
export function AvatarEditor({ avatarUrl, name, disabled = false }: AvatarEditorProps) {
  const { palette } = useTheme();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const snackbar = useSnackbar();
  const [error, setError] = useState<string | null>(null);
  const busy = upload.isPending || remove.isPending || disabled;

  const choose = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(COPY.picturePermission);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      ...LIBRARY_PHOTO_OPTIONS,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) {
      return;
    }
    try {
      await upload.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        file: asset.file ?? null,
      });
      snackbar.show(COPY.pictureUpdated, { icon: 'success' });
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const clear = async () => {
    setError(null);
    try {
      await remove.mutateAsync();
      snackbar.show(COPY.pictureRemoved, { icon: 'success' });
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const chooseLabel = avatarUrl ? COPY.changePicture : COPY.addPicture;
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Avatar src={avatarUrl} name={name} size={72} decorative={false} />
        <View style={styles.words}>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={chooseLabel}
              aria-busy={upload.isPending}
              disabled={busy}
              onPress={() => void choose()}
              hitSlop={8}
              testID="avatar-choose"
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              {upload.isPending ? <ActivityIndicator size="small" color={palette.primary} /> : null}
              <Text style={[styles.choose, { color: palette.primary }]}>{chooseLabel}</Text>
            </Pressable>
            {avatarUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.removePicture}
                aria-busy={remove.isPending}
                disabled={busy}
                onPress={() => void clear()}
                hitSlop={8}
                testID="avatar-remove"
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                {remove.isPending ? (
                  <ActivityIndicator size="small" color={palette.textMuted} />
                ) : null}
                <Text style={[styles.remove, { color: palette.textMuted }]}>
                  {COPY.removePicture}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.line, { color: palette.textMuted }]}>{COPY.pictureLine}</Text>
        </View>
      </View>
      {error ? <FormMessage testID="avatar-error">{error}</FormMessage> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  words: { flex: 1, minWidth: 0, gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[4] },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  choose: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold },
  remove: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  line: { fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.7 },
});
