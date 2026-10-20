import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  radius,
  type Palette,
  useTheme,
} from '@/src/theme';

import { ScanPhotoImage } from './ScanPhotoImage';
import { tileAction, tileText } from './scanCopy';
import type { ScanTile, TileStatus } from './scanSession';
import { useTextScale } from './useTextScale';

/** A tile is 160 points wide at the usual text size (the mockup's). */
const TILE_WIDTH = 160;
/** The picture of a tile (the mockup's 40 × 58 card). */
const PICTURE = { width: 40, height: 58 };

/** The status colour and the border of a tile, from the mockup mapped to the R1 tokens. */
export function tileTone(status: TileStatus, palette: Palette): { status: string; border: string } {
  switch (status) {
    case 'FOUND':
      return { status: palette.accent, border: palette.borderStrong };
    case 'PICK_RARITY':
    case 'PICK_PRINTING':
      // An amber border, a darker shade of the warning colour (the mockup's #6B5512).
      return { status: palette.warning, border: `${palette.warning}66` };
    case 'NOT_FOUND':
      return { status: palette.primary, border: palette.primaryContainer };
    default:
      return { status: palette.textMuted, border: palette.borderStrong };
  }
}

export interface ScanTileCardProps {
  tile: ScanTile;
  /** A waiting tile whose match is being tried again: "Trying again…", not tappable. */
  trying?: boolean;
  /** A tile that can be fixed or checked was tapped (found, pick, couldn't read, waiting). */
  onPress: (tile: ScanTile) => void;
}

/**
 * One tile of the tray (mockup screen 27): the card's picture (the collector's photo while it is
 * read, or when it could not be read), its name and code, its status, and "×n" for repeats. A
 * tile that is still being read cannot be tapped; one waiting for the connection is tried again
 * when tapped ("Trying again…" while it is, and it cannot be tapped then).
 */
export function ScanTileCard({ tile, trying = false, onPress }: ScanTileCardProps) {
  const { palette } = useTheme();
  const scale = useTextScale();
  const text = tileText(tile, trying);
  const tappable = tileAction(tile) !== null && !(trying && tile.status === 'WAITING');
  const tone = tileTone(tile.status, palette);
  const known = tile.card !== null && tile.status !== 'NOT_FOUND';
  const content = (
    <>
      <View style={styles.picture}>
        {known ? (
          <CardImage
            src={tile.card?.imageUrl}
            alt=""
            game="yugioh"
            size="xs"
            style={PICTURE}
            testID={`scan-tile-${tile.id}-picture`}
          />
        ) : (
          <ScanPhotoImage
            uri={tile.photos[0]?.uri}
            blurred={tile.status === 'NOT_FOUND'}
            style={PICTURE}
            testID={`scan-tile-${tile.id}-photo`}
          />
        )}
        {tile.status === 'READING' ? (
          <View style={[styles.reading, { backgroundColor: 'rgba(12, 10, 9, 0.55)' }]}>
            <ActivityIndicator size="small" color={palette.accent} />
          </View>
        ) : null}
        {text.badge ? (
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[
              styles.badge,
              {
                backgroundColor: palette.primary,
                color: palette.onPrimary,
                borderColor: palette.surface,
              },
            ]}
            testID={`scan-tile-${tile.id}-badge`}
          >
            {text.badge}
          </Text>
        ) : null}
      </View>
      <View style={styles.texts}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.name, { color: palette.ink }]}
        >
          {text.title}
        </Text>
        {text.code ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[
              styles.code,
              tile.status === 'PICK_PRINTING' ? null : styles.mono,
              { color: palette.textMuted },
            ]}
          >
            {text.code}
          </Text>
        ) : null}
        {text.status ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.status, { color: tone.status }]}
          >
            {text.status}
          </Text>
        ) : null}
      </View>
    </>
  );
  const frame = [
    styles.tile,
    { width: TILE_WIDTH * scale, backgroundColor: palette.surface, borderColor: tone.border },
  ];
  if (!tappable) {
    return (
      <View
        accessible
        accessibilityLabel={text.accessibilityLabel}
        style={frame}
        testID={`scan-tile-${tile.id}`}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text.accessibilityLabel}
      onPress={() => onPress(tile)}
      style={({ pressed }) => [frame, pressed && styles.pressed]}
      testID={`scan-tile-${tile.id}`}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 10,
  },
  picture: { width: PICTURE.width, height: PICTURE.height },
  reading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -7,
    top: -7,
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    borderWidth: 2,
    overflow: 'hidden',
    fontSize: 11,
    lineHeight: 18,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 12.5, lineHeight: 16, fontWeight: fontWeight.semibold },
  code: { fontSize: 11, lineHeight: 14 },
  mono: { fontFamily: fontFamily.mono },
  status: { fontSize: 11.5, lineHeight: 15, fontWeight: fontWeight.bold },
  pressed: { opacity: 0.8 },
});
