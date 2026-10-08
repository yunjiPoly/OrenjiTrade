import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { useDeleteAvatar, useUploadAvatar } from '@/src/api/hooks/profile';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { spacing } from '@/src/theme';

export interface AvatarEditorProps {
  avatarUrl: string | null | undefined;
  name: string | null | undefined;
}

/** Choose (square crop), replace or remove the profile picture (JPEG/PNG/WebP up to 5 MB). */
export function AvatarEditor({ avatarUrl, name }: AvatarEditorProps) {
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const snackbar = useSnackbar();
  const [error, setError] = useState<string | null>(null);
  const busy = upload.isPending || remove.isPending;

  const choose = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow access to your photos to choose a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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
      snackbar.show('Profile picture updated.');
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const clear = async () => {
    setError(null);
    try {
      await remove.mutateAsync();
      snackbar.show('Profile picture removed.');
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Avatar src={avatarUrl} name={name} size={72} decorative={false} />
        <View style={styles.actions}>
          <Button
            label={avatarUrl ? 'Change picture' : 'Add a picture'}
            variant="secondary"
            icon="image-outline"
            loading={upload.isPending}
            disabled={busy}
            onPress={() => void choose()}
            testID="avatar-choose"
          />
          {avatarUrl ? (
            <Button
              label="Remove picture"
              variant="ghost"
              loading={remove.isPending}
              disabled={busy}
              onPress={() => void clear()}
              testID="avatar-remove"
            />
          ) : null}
        </View>
      </View>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  actions: { flex: 1, gap: spacing[2] },
});
