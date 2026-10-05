import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { safeCardImageUrl } from '@/src/lib/cardImages';
import { initialsOf } from '@/src/lib/profile';
import { fontWeight, useTheme } from '@/src/theme';

export interface AvatarProps {
  /** `avatarUrl` from the API (served under `/api/v1/public/media/`), or null. */
  src?: string | null;
  name: string | null | undefined;
  size?: number;
  /** Decorative avatars (next to the name) are hidden from screen readers. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Round avatar: the uploaded picture, or the collector's initials. */
export function Avatar({
  src,
  name,
  size = 48,
  decorative = true,
  style,
  testID = 'avatar',
}: AvatarProps) {
  const { palette } = useTheme();
  const url = safeCardImageUrl(src);
  const [failed, setFailed] = useState(false);
  const showImage = url !== null && !failed;

  return (
    <View
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : `Profile picture of ${name ?? 'this collector'}`}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.primaryContainer,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            { color: palette.onPrimaryContainer, fontSize: Math.round(size * 0.38) },
          ]}
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontWeight: fontWeight.semibold },
});
