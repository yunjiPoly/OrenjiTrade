import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type View } from 'react-native';

/**
 * How much of a view the on-screen keyboard covers (0 when hidden or when the window already
 * resized for it). Screens whose content reaches the bottom of the window (a chat composer) pad by
 * it. Whether the window resizes depends on the platform and the runtime (edge-to-edge Android
 * builds do not, Expo Go does), so the overlap is measured: the view's bottom in the window minus
 * the keyboard's top.
 */
export function useKeyboardOverlap() {
  const ref = useRef<View>(null);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [bottom, setBottom] = useState<number | null>(null);

  const measure = () => {
    ref.current?.measureInWindow?.((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height)) {
        setBottom(y + height);
      }
    });
  };

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(show, (event) => {
      setKeyboardTop(event.endCoordinates.screenY);
      measure();
    });
    const hidden = Keyboard.addListener(hide, () => setKeyboardTop(null));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const overlap = keyboardTop !== null && bottom !== null ? Math.max(0, bottom - keyboardTop) : 0;
  return { ref, overlap, onLayout: measure };
}
