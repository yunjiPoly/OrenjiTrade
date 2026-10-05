import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface SnackbarOptions {
  /** Milliseconds before it hides (default 4000). */
  duration?: number;
  tone?: 'default' | 'error';
}

interface SnackbarMessage extends Required<SnackbarOptions> {
  id: number;
  text: string;
}

export interface Snackbar {
  show: (text: string, options?: SnackbarOptions) => void;
  hide: () => void;
}

const SnackbarContext = createContext<Snackbar | null>(null);

/**
 * App-wide toast (the web's MatSnackBar): one message at a time at the bottom of the screen,
 * announced politely to screen readers, dismissible with a tap.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const nextId = useRef(1);

  const hide = useCallback(() => setMessage(null), []);
  const show = useCallback((text: string, options: SnackbarOptions = {}) => {
    setMessage({
      id: nextId.current++,
      text,
      duration: options.duration ?? 4000,
      tone: options.tone ?? 'default',
    });
  }, []);

  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const timer = setTimeout(() => setMessage(null), message.duration);
    return () => clearTimeout(timer);
  }, [message]);

  const value = useMemo<Snackbar>(() => ({ show, hide }), [show, hide]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {message ? <SnackbarView key={message.id} message={message} onDismiss={hide} /> : null}
    </SnackbarContext.Provider>
  );
}

function SnackbarView({ message, onDismiss }: { message: SnackbarMessage; onDismiss: () => void }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + spacing[16] }]}>
      <Pressable
        testID="snackbar"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityHint="Tap to dismiss"
        onPress={onDismiss}
        style={[
          styles.bar,
          elevation.menu,
          { backgroundColor: message.tone === 'error' ? palette.danger : palette.ink },
        ]}
      >
        <Text style={[textStyle('sm'), styles.text, { color: palette.background }]}>
          {message.text}
        </Text>
      </Pressable>
    </View>
  );
}

export function useSnackbar(): Snackbar {
  const snackbar = useContext(SnackbarContext);
  if (snackbar === null) {
    throw new Error('useSnackbar() must be used within <SnackbarProvider>.');
  }
  return snackbar;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
  bar: {
    maxWidth: 560,
    width: '100%',
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  text: { fontWeight: fontWeight.medium },
});
