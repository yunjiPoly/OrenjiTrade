import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui/Text';
import { elevation, fontWeight, lightPalette, spacing, textStyle, useTheme } from '@/src/theme';

/** How long a toast stays (owner spec 2026-10-14, section 3: "about 5 seconds"). */
export const SNACKBAR_DURATION_MS = 5000;

/**
 * How long a toast with an action stays while a screen reader runs: reaching "Undo" by swiping
 * takes longer than a glance and a tap (WCAG 2.2.1, timing adjustable).
 */
export const SNACKBAR_SCREEN_READER_ACTION_MS = 15000;

export interface SnackbarAction {
  /** "Undo", "View". */
  label: string;
  onPress: () => void;
  testID?: string;
}

export interface SnackbarOptions {
  /** Milliseconds before it hides (default {@link SNACKBAR_DURATION_MS}). */
  duration?: number;
  tone?: 'default' | 'error';
  /** A bold first line ("Saved"); the text is then the second line (the card's name). */
  title?: string;
  /** A round icon before the words: a check ("Saved") or a bin ("Card deleted"). */
  icon?: 'success' | 'deleted';
  /** One action on the right ("Undo", "View"); the toast hides when it is pressed. */
  action?: SnackbarAction;
}

interface SnackbarMessage {
  id: number;
  text: string;
  duration: number;
  tone: 'default' | 'error';
  title: string | null;
  icon: 'success' | 'deleted' | null;
  action: SnackbarAction | null;
}

export interface Snackbar {
  show: (text: string, options?: SnackbarOptions) => void;
  hide: () => void;
}

const SnackbarContext = createContext<Snackbar | null>(null);

/**
 * App-wide toast (the web's MatSnackBar; owner spec 2026-10-14, section 3): one message at a time
 * at the bottom of the screen, about five seconds, with an optional action ("Undo", "View").
 * Announced to screen readers; the message itself dismisses it with a tap.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const nextId = useRef(1);
  const screenReader = useRef(false);

  useEffect(() => {
    // react-native-web answers "yes" for every visitor (a browser cannot tell): the web keeps the
    // usual duration.
    if (Platform.OS === 'web') {
      return undefined;
    }
    let active = true;
    void Promise.resolve(AccessibilityInfo.isScreenReaderEnabled?.())
      .then((enabled) => {
        if (active) {
          screenReader.current = enabled === true;
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('screenReaderChanged', (enabled) => {
      screenReader.current = enabled;
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const hide = useCallback(() => setMessage(null), []);
  const show = useCallback((text: string, options: SnackbarOptions = {}) => {
    const action = options.action ?? null;
    const duration =
      options.duration ??
      (action && screenReader.current ? SNACKBAR_SCREEN_READER_ACTION_MS : SNACKBAR_DURATION_MS);
    setMessage({
      id: nextId.current++,
      text,
      duration,
      tone: options.tone ?? 'default',
      title: options.title ?? null,
      icon: options.icon ?? null,
      action,
    });
    const spoken = [options.title, text, action?.label].filter(Boolean).join('. ');
    AccessibilityInfo.announceForAccessibility?.(spoken);
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
  const error = message.tone === 'error';
  const ink = error ? palette.background : palette.ink;
  const muted = error ? palette.background : palette.textMuted;
  const spoken = [message.title, message.text].filter(Boolean).join(', ');
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + spacing[16] }]}>
      <View
        testID="snackbar"
        style={[
          styles.bar,
          elevation.menu,
          error
            ? { backgroundColor: palette.danger, borderColor: palette.danger }
            : { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong },
        ]}
      >
        <Pressable
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={spoken}
          accessibilityHint="Tap to dismiss"
          onPress={onDismiss}
          testID="snackbar-message"
          style={styles.message}
        >
          {message.icon ? <ToastIcon icon={message.icon} /> : null}
          <View style={styles.texts}>
            {message.title ? (
              <Text style={[textStyle('md'), styles.title, { color: ink }]}>{message.title}</Text>
            ) : null}
            <Text
              numberOfLines={message.title ? 1 : undefined}
              style={[
                textStyle('sm'),
                message.title ? null : styles.only,
                { color: message.title ? muted : ink },
              ]}
            >
              {message.text}
            </Text>
          </View>
        </Pressable>
        {message.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${message.action.label}, ${spoken}`}
            onPress={() => {
              const action = message.action;
              onDismiss();
              action?.onPress();
            }}
            hitSlop={8}
            testID={message.action.testID ?? 'snackbar-action'}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text
              style={[
                textStyle('sm'),
                styles.actionLabel,
                { color: error ? palette.background : palette.primary },
              ]}
            >
              {message.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ToastIcon({ icon }: { icon: 'success' | 'deleted' }) {
  const { palette } = useTheme();
  // The check sits on the same green in both schemes (white on it reads at 3.3 : 1, enough for a
  // symbol); the bin on the strong border colour, like the mockup.
  const background = icon === 'success' ? lightPalette.success : palette.borderStrong;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.icon, { backgroundColor: background }]}
    >
      <MaterialCommunityIcons
        name={icon === 'success' ? 'check-bold' : 'trash-can-outline'}
        size={16}
        color={icon === 'success' ? '#FFFFFF' : palette.ink}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    paddingVertical: spacing[1],
  },
  message: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 44,
    paddingVertical: spacing[2],
  },
  texts: { flex: 1, gap: 2 },
  title: { fontWeight: fontWeight.bold },
  only: { fontWeight: fontWeight.medium },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontWeight: fontWeight.bold },
  pressed: { opacity: 0.7 },
});
