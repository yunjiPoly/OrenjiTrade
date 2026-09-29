import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useAppStore } from '@/src/store/useAppStore';

import { paletteFor, type ColorScheme, type Palette } from './palette';
import { tokens } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  palette: Palette;
  tokens: typeof tokens;
  /** True when the scheme comes from the user override rather than the OS. */
  isOverridden: boolean;
}

export const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Force a scheme (tests, previews). */
  scheme?: ColorScheme;
}

type NavigationTheme = typeof NavigationDefaultTheme;

function buildNavigationTheme(palette: Palette): NavigationTheme {
  const base = palette.scheme === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.surface,
      text: palette.ink,
      border: palette.border,
      notification: palette.primary,
    },
  };
}

/**
 * Resolves the colour scheme from the OS (`useColorScheme`) and the user's override stored in
 * zustand, then exposes the semantic palette + raw tokens through `useTheme()` and syncs
 * React Navigation's theme so headers and tab bars match.
 */
export function ThemeProvider({ children, scheme: forcedScheme }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const override = useAppStore((state) => state.themeOverride);

  const theme = useMemo<Theme>(() => {
    const resolved: ColorScheme =
      forcedScheme ??
      (override === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : override);
    return {
      scheme: resolved,
      palette: paletteFor(resolved),
      tokens,
      isOverridden: forcedScheme === undefined && override !== 'system',
    };
  }, [forcedScheme, override, systemScheme]);

  const navigationTheme = useMemo(() => buildNavigationTheme(theme.palette), [theme.palette]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}
