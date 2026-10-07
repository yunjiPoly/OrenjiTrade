import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { attributionFor, safeCardImageUrl } from '@/src/lib/cardImages';
import { fontWeight, radius, spacing, textStyle, useTheme, type ViewStyleProp } from '@/src/theme';

import { Skeleton } from './Skeleton';

/** Rendered sizes (trading-card ratio 5:7), same scale as the web's `app-card-image`. */
export const CARD_IMAGE_SIZES = {
  xs: { width: 36, height: 50 },
  sm: { width: 56, height: 78 },
  md: { width: 120, height: 168 },
  lg: { width: 240, height: 336 },
} as const;

export type CardImageSize = keyof typeof CARD_IMAGE_SIZES;

export interface CardImageProps {
  /** A picture URL from the API (`/api/v1/public/card-images/{id}` ...); anything else is refused. */
  src: string | null | undefined;
  /** Card name (accessible label); empty for a decorative picture. */
  alt: string;
  /** Game slug, for the placeholder art. */
  game?: string | null;
  size?: CardImageSize;
  style?: ViewStyleProp;
  testID?: string;
}

type State = 'loading' | 'loaded' | 'error' | 'placeholder';

/**
 * A card picture rendered with `expo-image` (memory + disk cache) from API-provided URLs only
 * (ADR 0015), a skeleton while it loads and the placeholder art when there is no picture or it
 * fails to load.
 */
export function CardImage(props: CardImageProps) {
  const url = safeCardImageUrl(props.src);
  // A new picture starts over (skeleton, then image or placeholder).
  return <CardImageFrame key={url ?? 'none'} {...props} url={url} />;
}

function CardImageFrame({
  url,
  alt,
  game,
  size = 'md',
  style,
  testID = 'card-image',
}: CardImageProps & { url: string | null }) {
  const { palette } = useTheme();
  const [state, setState] = useState<State>(url ? 'loading' : 'placeholder');
  const dimensions = CARD_IMAGE_SIZES[size];

  const decorative = alt.trim().length === 0;
  const showImage = url !== null && state !== 'error';

  return (
    <View
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : alt}
      style={[styles.frame, dimensions, { backgroundColor: palette.surfaceVariant }, style]}
    >
      {showImage ? (
        <Image
          testID={`${testID}-img`}
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          accessible={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      ) : (
        <View
          testID={`${testID}-placeholder`}
          style={[StyleSheet.absoluteFill, styles.placeholder]}
        >
          <MaterialCommunityIcons
            name={
              game === 'yugioh'
                ? 'eye-outline'
                : game === 'pokemon'
                  ? 'lightning-bolt'
                  : 'cards-outline'
            }
            size={Math.round(dimensions.width / 2.5)}
            color={palette.textMuted}
          />
        </View>
      )}
      {showImage && state === 'loading' ? (
        <Skeleton
          testID={`${testID}-skeleton`}
          width={dimensions.width}
          height={dimensions.height}
          radius={radius.sm}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

export interface CardDataCreditProps {
  game: string | null | undefined;
  testID?: string;
}

/** The provider credit line owed wherever a game's catalog pictures are shown (web wording). */
export function CardDataCredit({ game, testID = 'card-data-credit' }: CardDataCreditProps) {
  const { palette } = useTheme();
  const attribution = attributionFor(game);
  if (!attribution) {
    return null;
  }
  return (
    <View testID={testID} style={styles.credit}>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        {attribution.credit}{' '}
        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openURL(attribution.providerUrl).catch(() => undefined)}
          style={[styles.link, { color: palette.accent }]}
        >
          {attribution.provider}
        </Text>
        .
      </Text>
      <Text style={[textStyle('xs'), { color: palette.textDisabled }]}>{attribution.notice}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.sm, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  credit: { gap: spacing[1] },
  link: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
});
