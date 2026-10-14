import { render, renderHook, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import { StyleSheet } from 'react-native';

import RootLayout from '@/app/_layout';
import { Text, TextInput } from '@/src/components/ui/Text';
import {
  APP_FONTS,
  FONT_FAMILIES,
  fontFace,
  fontRequest,
  fontStyleFor,
  fontsReady,
  headerTitleFont,
  navigationFonts,
  setFontsReady,
} from '@/src/theme/fonts';
import { fontFamily, fontWeight, textStyle } from '@/src/theme/styles';
import { useAppFonts } from '@/src/theme/useAppFonts';

jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [true, null]) }));

const mockedUseFonts = useFonts as jest.MockedFunction<typeof useFonts>;

function familyOf(testID: string): string | undefined {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style)?.fontFamily;
}

afterEach(() => {
  setFontsReady(false);
  mockedUseFonts.mockReset();
  mockedUseFonts.mockReturnValue([true, null]);
});

describe('the three typefaces (spec 2026-10-14, section 3)', () => {
  it('bundles only the faces the app uses', () => {
    expect(Object.keys(APP_FONTS).sort()).toEqual([
      'Inter_400Regular',
      'Inter_400Regular_Italic',
      'Inter_500Medium',
      'Inter_600SemiBold',
      'Inter_700Bold',
      'JetBrainsMono_500Medium',
      'Sora_600SemiBold',
      'Sora_700Bold',
    ]);
    expect(FONT_FAMILIES).toEqual({ display: 'Sora', body: 'Inter', mono: 'JetBrains Mono' });
    // The theme's styles name them: headings Sora, the rest Inter, codes JetBrains Mono.
    expect(textStyle('2xl', 'heading').fontFamily).toBe('Sora');
    expect(textStyle('md').fontFamily).toBe('Inter');
    expect(fontFamily.mono).toBe('JetBrains Mono');
  });

  it('turns a family and a weight into the closest bundled face', () => {
    const face = (family: string, weight: number, italic = false) =>
      fontFace({ family, weight, italic });
    expect(face('Inter', 400)).toBe('Inter_400Regular');
    expect(face('Inter', 500)).toBe('Inter_500Medium');
    expect(face('Inter', 600)).toBe('Inter_600SemiBold');
    expect(face('Inter', 700)).toBe('Inter_700Bold');
    expect(face('Inter', 900)).toBe('Inter_700Bold');
    expect(face('Inter', 300)).toBe('Inter_400Regular');
    expect(face('Inter', 700, true)).toBe('Inter_400Regular_Italic');
    expect(face('Sora', 400)).toBe('Sora_600SemiBold');
    expect(face('Sora', 700)).toBe('Sora_700Bold');
    expect(face('JetBrains Mono', 700)).toBe('JetBrainsMono_500Medium');
    expect(face('Courier', 400)).toBeNull();
  });

  it('inherits what the surrounding text asks for, like native nested text', () => {
    const parent = fontRequest({ fontFamily: 'Sora', fontWeight: 'bold' });
    expect(parent).toEqual({ family: 'Sora', weight: 700, italic: false });
    expect(fontRequest({}, parent)).toEqual(parent);
    expect(fontRequest({ fontWeight: '500' }, parent)).toEqual({
      family: 'Sora',
      weight: 500,
      italic: false,
    });
    expect(fontRequest(undefined)).toEqual({ family: 'Inter', weight: 400, italic: false });
    expect(fontRequest({ fontStyle: 'italic' })).toMatchObject({ italic: true });
  });

  it('uses the system font until the fonts are loaded, and never names an unknown family', () => {
    setFontsReady(false);
    expect(fontStyleFor({ family: 'Inter', weight: 600, italic: false })).toEqual({
      fontFamily: undefined,
    });
    expect(fontStyleFor({ family: 'JetBrains Mono', weight: 400, italic: false })).toEqual({
      fontFamily: 'Menlo',
    });
    expect(fontStyleFor({ family: 'Courier', weight: 400, italic: false })).toBeNull();
    expect(headerTitleFont()).toEqual({});
    setFontsReady(true);
    // The face carries the weight: a synthesised bold on top would be wrong.
    expect(fontStyleFor({ family: 'Inter', weight: 600, italic: false })).toEqual({
      fontFamily: 'Inter_600SemiBold',
      fontWeight: 'normal',
      fontStyle: 'normal',
    });
    expect(headerTitleFont()).toEqual({ fontFamily: 'Sora_600SemiBold', fontWeight: 'normal' });
  });

  it('gives the navigation headers and tab labels the bundled faces once loaded', () => {
    const system = {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium: { fontFamily: 'System', fontWeight: '500' as const },
      bold: { fontFamily: 'System', fontWeight: '600' as const },
      heavy: { fontFamily: 'System', fontWeight: '700' as const },
    };
    expect(navigationFonts(system)).toBe(system);
    setFontsReady(true);
    expect(navigationFonts(system)).toEqual({
      regular: { fontFamily: 'Inter_400Regular', fontWeight: 'normal' },
      medium: { fontFamily: 'Inter_500Medium', fontWeight: 'normal' },
      bold: { fontFamily: 'Inter_600SemiBold', fontWeight: 'normal' },
      heavy: { fontFamily: 'Sora_700Bold', fontWeight: 'normal' },
    });
  });
});

describe('the themed Text and TextInput', () => {
  it('render every screen’s text in the bundled faces, nested text included', () => {
    setFontsReady(true);
    render(
      <>
        <Text testID="body" style={textStyle('md')}>
          Body <Text testID="nested-plain">inherits</Text>{' '}
          <Text testID="nested-mono" style={{ fontFamily: fontFamily.mono }}>
            LOB-EN001
          </Text>
        </Text>
        <Text testID="strong" style={[textStyle('sm'), { fontWeight: fontWeight.semibold }]}>
          Strong <Text testID="nested-strong">and its child</Text>
        </Text>
        <Text testID="title" style={[textStyle('2xl', 'heading'), { fontWeight: '700' }]}>
          Inventory
        </Text>
        <Text testID="plain">No style at all</Text>
        <Text testID="other" style={{ fontFamily: 'Courier' }}>
          Untouched
        </Text>
        <TextInput testID="input" style={textStyle('md')} />
      </>
    );
    expect(familyOf('body')).toBe('Inter_400Regular');
    expect(familyOf('nested-plain')).toBe('Inter_400Regular');
    expect(familyOf('nested-mono')).toBe('JetBrainsMono_500Medium');
    expect(familyOf('strong')).toBe('Inter_600SemiBold');
    expect(familyOf('nested-strong')).toBe('Inter_600SemiBold');
    expect(familyOf('title')).toBe('Sora_700Bold');
    expect(familyOf('plain')).toBe('Inter_400Regular');
    expect(familyOf('other')).toBe('Courier');
    expect(familyOf('input')).toBe('Inter_400Regular');
    expect(StyleSheet.flatten(screen.getByTestId('strong').props.style)?.fontWeight).toBe('normal');
  });

  it('keep the system font and the weights while the fonts are not loaded', () => {
    setFontsReady(false);
    render(
      <Text testID="strong" style={[textStyle('sm'), { fontWeight: '600' }]}>
        Strong
      </Text>
    );
    const style = StyleSheet.flatten(screen.getByTestId('strong').props.style);
    expect(style?.fontFamily).toBeUndefined();
    expect(style?.fontWeight).toBe('600');
  });
});

describe('loading the fonts before the first screen', () => {
  it('waits on a phone until they are loaded, then names them', () => {
    mockedUseFonts.mockReturnValue([false, null]);
    const { result, rerender } = renderHook(() => useAppFonts());
    expect(result.current).toBe(false);
    expect(fontsReady()).toBe(false);
    mockedUseFonts.mockReturnValue([true, null]);
    rerender({});
    expect(result.current).toBe(true);
    expect(fontsReady()).toBe(true);
    expect(mockedUseFonts).toHaveBeenCalledWith(APP_FONTS);
  });

  it('never leaves a blank app when a font fails: the system font is used', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedUseFonts.mockReturnValue([false, new Error('font file missing')]);
    const { result } = renderHook(() => useAppFonts());
    expect(result.current).toBe(true);
    expect(fontsReady()).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('using the system font'));
    warn.mockRestore();
  });

  it('draws no screen while the fonts load (the splash screen stays up)', () => {
    mockedUseFonts.mockReturnValue([false, null]);
    const view = render(<RootLayout />);
    expect(view.toJSON()).toBeNull();
  });
});
