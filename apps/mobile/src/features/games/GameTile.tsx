import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontFamily, fontWeight } from '@/src/theme';

import { gameTile } from './gameTiles';

/**
 * The tile sizes of the mockup: pills and section titles (22), sheet rows (38), a room's top bar
 * (36) and the room list (46, stage R11), empty states (64).
 */
export type GameTileSize = 22 | 34 | 36 | 38 | 46 | 64;

const SHAPE: Record<GameTileSize, { radius: number; font: number }> = {
  22: { radius: 6, font: 12 },
  34: { radius: 9, font: 15 },
  36: { radius: 11, font: 15 },
  38: { radius: 10, font: 17 },
  46: { radius: 14, font: 19 },
  64: { radius: 18, font: 28 },
};

export interface GameTileProps {
  slug: string;
  /** The game's name, for a game the tokens have no tile for. */
  name?: string | null;
  size?: GameTileSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A game's monogram tile (stage G): a rounded square with the game's letter. Decorative: the name
 * next to it is what a screen reader says, so the tile is hidden from it. Its size never follows
 * the text size (a tile, not text).
 */
export function GameTile({ slug, name, size = 22, style, testID }: GameTileProps) {
  const tile = gameTile(slug, name);
  const shape = SHAPE[size];
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: shape.radius, backgroundColor: tile.background },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.letter,
          {
            color: tile.foreground,
            fontSize: shape.font,
            lineHeight: Math.round(shape.font * 1.2),
          },
        ]}
      >
        {tile.letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  letter: { fontFamily: fontFamily.display, fontWeight: fontWeight.bold },
});
