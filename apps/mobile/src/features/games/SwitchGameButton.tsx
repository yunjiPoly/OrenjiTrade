import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { Button } from '@/src/components/ui/Button';

import { GAME_COPY } from './gameCopy';
import { GameSheet } from './GameSheet';

export interface SwitchGameButtonProps {
  style?: StyleProp<ViewStyle>;
  /** The button; its sheet is `<testID>-sheet`. */
  testID?: string;
}

/**
 * "Switch game" (stage G, mockup screen 34's empty state; review fix 1, U4): the secondary action
 * of an empty state that names the browsed game. It opens "Choose a game", as the game pill does;
 * Home (stage R7) places it in its own empty state.
 */
export function SwitchGameButton({ style, testID = 'switch-game' }: SwitchGameButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        label={GAME_COPY.switchGame}
        variant="secondary"
        onPress={() => setOpen(true)}
        style={style}
        testID={testID}
      />
      <GameSheet visible={open} onClose={() => setOpen(false)} testID={`${testID}-sheet`} />
    </>
  );
}
