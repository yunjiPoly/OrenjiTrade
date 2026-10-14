import { createContext, forwardRef, useContext, useMemo } from 'react';
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  StyleSheet,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import { fontRequest, fontStyleFor, type FontRequest } from '@/src/theme/fonts';

/** The font a text asks for, so nested text inherits it as native text does. */
const FontContext = createContext<FontRequest | null>(null);

/**
 * The app's `Text`: React Native's, rendered in the theme's typefaces (src/theme/fonts.ts). A
 * style names a family (`textStyle`: Inter, or Sora for headings; `fontFamily.mono`: JetBrains
 * Mono) and a weight; this turns them into the bundled face, which React Native cannot do for a
 * custom font. Nested text inherits its parent's family, weight and style unless it sets its own.
 * Every screen imports `Text` from here, never from `react-native`.
 */
export const Text = forwardRef<NativeText, TextProps>(function Text(props, ref) {
  const parent = useContext(FontContext);
  const flat = StyleSheet.flatten(props.style);
  const family = flat?.fontFamily;
  const weight = flat?.fontWeight;
  const fontStyle = flat?.fontStyle;
  const request = useMemo(
    () => fontRequest({ fontFamily: family, fontWeight: weight, fontStyle }, parent),
    [family, weight, fontStyle, parent]
  );
  const font = fontStyleFor(request);
  return (
    <FontContext.Provider value={request}>
      <NativeText ref={ref} {...props} style={font ? [props.style, font] : props.style} />
    </FontContext.Provider>
  );
});

/** The app's `TextInput`, in the theme's typefaces like `Text`. */
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(
  function TextInput(props, ref) {
    const flat = StyleSheet.flatten(props.style);
    const font = fontStyleFor(fontRequest(flat));
    return (
      <NativeTextInput ref={ref} {...props} style={font ? [props.style, font] : props.style} />
    );
  }
);
