import { act, render, screen } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import { Text, TextInput } from '@/src/components/ui/Text';
import { useAppStore } from '@/src/store/useAppStore';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import { useTheme } from '@/src/theme/useTheme';

function Scheme() {
  const { scheme, palette, isOverridden } = useTheme();
  return (
    <Text testID="scheme">
      {scheme} {palette.background} {isOverridden ? 'chosen' : 'system'}
    </Text>
  );
}

beforeEach(() => {
  useAppStore.getState().reset();
  jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the theme of a new install (spec 2026-10-14, sections 3 and 16)', () => {
  it('is dark even on a phone set to light, and System / Light / Dark still apply', async () => {
    render(
      <ThemeProvider>
        <Scheme />
      </ThemeProvider>
    );
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark #141210 chosen');
    await act(async () => useAppStore.getState().setThemeOverride('system'));
    expect(screen.getByTestId('scheme')).toHaveTextContent('light #FFFBF7 system');
    await act(async () => useAppStore.getState().setThemeOverride('light'));
    expect(screen.getByTestId('scheme')).toHaveTextContent('light #FFFBF7 chosen');
    await act(async () => useAppStore.getState().setThemeOverride('dark'));
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark #141210 chosen');
  });
});

describe('the system views follow the theme chosen in the app (iOS)', () => {
  it('tells iOS the chosen scheme, and hands "System" back to the phone', async () => {
    const setColorScheme = jest
      .spyOn(ReactNative.Appearance, 'setColorScheme')
      .mockImplementation(() => undefined);
    render(
      <ThemeProvider>
        <Scheme />
      </ThemeProvider>
    );
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    await act(async () => useAppStore.getState().setThemeOverride('system'));
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    await act(async () => useAppStore.getState().setThemeOverride('light'));
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('leaves the system alone for a forced scheme (tests, previews)', () => {
    const setColorScheme = jest
      .spyOn(ReactNative.Appearance, 'setColorScheme')
      .mockImplementation(() => undefined);
    render(
      <ThemeProvider scheme="light">
        <Scheme />
      </ThemeProvider>
    );
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('opens the keyboard in the theme of the app unless a field chooses its own', async () => {
    jest.spyOn(ReactNative.Appearance, 'setColorScheme').mockImplementation(() => undefined);
    render(
      <ThemeProvider>
        <TextInput testID="field" accessibilityLabel="Message" />
        <TextInput testID="own" accessibilityLabel="Own" keyboardAppearance="light" />
      </ThemeProvider>
    );
    // A new install is dark on a phone set to light: a dark keyboard, not a white one.
    expect(screen.getByTestId('field')).toHaveProp('keyboardAppearance', 'dark');
    expect(screen.getByTestId('own')).toHaveProp('keyboardAppearance', 'light');
    await act(async () => useAppStore.getState().setThemeOverride('light'));
    expect(screen.getByTestId('field')).toHaveProp('keyboardAppearance', 'light');
    await act(async () => useAppStore.getState().setThemeOverride('system'));
    expect(screen.getByTestId('field')).toHaveProp('keyboardAppearance', 'light');
  });
});
