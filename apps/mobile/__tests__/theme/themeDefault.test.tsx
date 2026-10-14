import { act, render, screen } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import { Text } from '@/src/components/ui/Text';
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
