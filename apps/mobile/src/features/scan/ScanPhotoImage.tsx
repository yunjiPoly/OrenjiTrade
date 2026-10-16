import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/src/theme';

export interface ScanPhotoImageProps {
  /** The local photo file (a camera photo, or the picker's copy): never a remote address. */
  uri: string | null | undefined;
  /** Blurred, for a card that could not be read (the mockup's tray tile). */
  blurred?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The collector's own photo of a card ("Your photo"), drawn from its local file. Decorative: the
 * screen says what it is in words. It is shown only on this phone and never cached by the image
 * loader on disk (the file is deleted when the scan ends).
 */
export function ScanPhotoImage({ uri, blurred = false, style, testID }: ScanPhotoImageProps) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  const local = typeof uri === 'string' && uri.length > 0 ? uri : null;
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { backgroundColor: palette.surfaceVariant }, style]}
    >
      {local && !failed ? (
        <Image
          source={{ uri: local }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="none"
          blurRadius={blurred ? 2 : 0}
          accessible={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <MaterialCommunityIcons name="image-outline" size={18} color={palette.textMuted} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.sm, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
