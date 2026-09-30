import { useContext } from 'react';

import { ThemeContext, type Theme } from './ThemeProvider';

/** Returns the resolved theme. Must be used inside `<ThemeProvider>`. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme() must be used within <ThemeProvider>.');
  }
  return theme;
}
