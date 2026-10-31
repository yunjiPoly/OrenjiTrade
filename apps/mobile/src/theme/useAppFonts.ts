import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { APP_FONTS, fontsReady, setFontsReady } from './fonts';

/**
 * Loads the three typefaces (src/theme/fonts.ts) and says when the app may draw its first
 * screen: on a phone once they are loaded (the splash screen stays up until then; a font that
 * fails to load leaves the system font, never a blank app), on the web at once (the static
 * render declares them in the page and the browser swaps them in).
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(APP_FONTS);
  if (loaded && !fontsReady()) {
    // Before the first screen renders: the themed Text names the bundled faces from now on.
    setFontsReady(true);
  }
  useEffect(() => {
    if (error) {
      console.warn(`[fonts] The app fonts could not load; using the system font. ${error.message}`);
    }
  }, [error]);
  return Platform.OS === 'web' || loaded || !!error;
}
