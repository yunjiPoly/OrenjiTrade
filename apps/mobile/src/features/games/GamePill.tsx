import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { PINNED_MAX_FONT_SCALE, fontWeight, radius, spacing, useTheme } from '@/src/theme';

import { useBrowsingGame } from './browsingGame';
import { GAME_COPY } from './gameCopy';
import { GameSheet } from './GameSheet';
import { GameTile } from './GameTile';

export interface GamePillProps {
  style?: StyleProp<ViewStyle>;
  /** The pill; its sheet is `<testID>-sheet`. */
  testID?: string;
}

/**
 * The game pill (stage G, mockup screens 10, 11 to 15 and 34): the browsed game's 22 pt tile, its
 * short name and a chevron, 36 pt tall; it opens "Choose a game". Search places it right of its
 * title on every segment, Home (stage R7) right of the region pill. Spoken "Game: {name}. Change
 * game". It stays on screen above lists, so its text follows the system text size only a little.
 */
export function GamePill({ style, testID = 'game-pill' }: GamePillProps) {
  const { palette } = useTheme();
  const { current } = useBrowsingGame();
  const [open, setOpen] = useState(false);
  const label = GAME_COPY.pillLabel(current.name);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityShowsLargeContentViewer
        accessibilityLargeContentTitle={label}
        onPress={() => setOpen(true)}
        hitSlop={4}
        testID={testID}
        style={({ pressed }) => [
          styles.pill,
          { borderColor: palette.borderStrong, backgroundColor: palette.surface },
          pressed && styles.pressed,
          style,
        ]}
      >
        <GameTile slug={current.slug} name={current.name} size={22} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.name, { color: palette.ink }]}
          testID={`${testID}-name`}
        >
          {current.name}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={palette.textMuted} />
      </Pressable>
      <GameSheet visible={open} onClose={() => setOpen(false)} testID={`${testID}-sheet`} />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingLeft: 7,
    paddingRight: spacing[2] + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 1,
  },
  name: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold, flexShrink: 1 },
  pressed: { opacity: 0.8 },
});
