import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useEffect, useMemo, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { useAppStore } from '@/src/store/useAppStore';

import { navigationFonts } from './fonts';
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
    // Inter for back titles and tab labels, Sora for large titles (src/theme/fonts.ts).
    fonts: navigationFonts(base.fonts),
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
 * On iOS, the system's own views (the keyboard, alerts, the photo and document pickers, the share
 * sheet) follow the theme chosen in the app: a new install is dark (spec 2026-10-14, sections 3
 * and 16) even on a phone set to light. "System" hands the choice back to the phone. Android is
 * left to the system (its keyboard ignores the app, and switching its night mode recreates the
 * activity), and the web has no such call.
 */
export function syncNativeAppearance(override: 'system' | ColorScheme): void {
  if (Platform.OS !== 'ios' || typeof Appearance.setColorScheme !== 'function') {
    return;
  }
  Appearance.setColorScheme(override === 'system' ? 'unspecified' : override);
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

  useEffect(() => {
    if (forcedScheme === undefined) {
      syncNativeAppearance(override);
    }
  }, [forcedScheme, override]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}
