import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How tall the on-screen keyboard is on iOS (0 while it is hidden). A sheet with a field (the
 * printing list's "Code on your card") pads its bottom by it, or iOS draws the keyboard over the
 * field: the sheet's window does not move for the keyboard there. Android resizes a modal's window
 * for the keyboard by itself (0 there).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }
    const shown = Keyboard.addListener('keyboardWillShow', (event) =>
      setHeight(event.endCoordinates.height)
    );
    const hidden = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}
