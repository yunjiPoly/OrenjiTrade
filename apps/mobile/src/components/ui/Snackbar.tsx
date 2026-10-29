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
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui/Text';
import {
  PINNED_MAX_FONT_SCALE,
  elevation,
  fontSize,
  fontWeight,
  lightPalette,
  spacing,
  textStyle,
  tokens,
  useTheme,
} from '@/src/theme';

/** How long a toast stays (owner spec 2026-10-14, section 3: "about 5 seconds"). */
export const SNACKBAR_DURATION_MS = 5000;

/**
 * How long a toast with an action stays while a screen reader runs: reaching "Undo" by swiping
 * takes longer than a glance and a tap (WCAG 2.2.1, timing adjustable).
 */
export const SNACKBAR_SCREEN_READER_ACTION_MS = 15000;

/**
 * How far a toast's words follow the system text size (owner decision of 2026-10-28, R8 follow-up
 * 1: cap the small things, the pop-up messages among them): as little as the controls pinned above
 * a list and R14's refusals in a page's bottom bar. At the largest sizes a toast otherwise covered
 * most of the screen for its five seconds.
 */
export const SNACKBAR_MAX_FONT_SCALE = PINNED_MAX_FONT_SCALE;

/** The most of the window's height a toast covers at the largest text sizes: about a quarter. */
export const SNACKBAR_MAX_WINDOW_SHARE = 0.25;

/** The text size at which the action goes under the words instead of beside them. */
export const SNACKBAR_STACKED_FONT_SCALE = 1.3;

/**
 * The lines a toast's title ("Saved", "Card deleted") takes, as `toastLayout` counts them: one,
 * shrunk to fit rather than cut when a title is longer (review fix 1 of the owner decisions of
 * 2026-10-28, F8: two allowed lines pushed a toast past its quarter of the window).
 */
export const SNACKBAR_TITLE_LINES = 1;

/** Where a toast's words are laid out: their capped scale, whether stacked, and their lines. */
export interface ToastLayout {
  stacked: boolean;
  /** The lines the words may take: the toast stays within `SNACKBAR_MAX_WINDOW_SHARE`. */
  textLines: number;
}

/**
 * The layout of a toast at a window height and text size: the action under the words above
 * `SNACKBAR_STACKED_FONT_SCALE`, and as many lines of words as keep the whole toast (its padding,
 * the title's lines, the action's 44 pt row) within a quarter of the window, never fewer than two.
 * With a title beside its action the words keep one line, stacked at most three. The full words
 * are always in the screen reader's label.
 */
export function toastLayout(
  windowHeight: number,
  fontScale: number,
  { title, action }: { title: boolean; action: boolean }
): ToastLayout {
  const stacked = fontScale > SNACKBAR_STACKED_FONT_SCALE;
  const scale = Math.min(Math.max(fontScale, 1), SNACKBAR_MAX_FONT_SCALE);
  const line = Math.round(fontSize.sm * tokens.lineHeight.body) * scale;
  const titleLine = Math.round(fontSize.md * tokens.lineHeight.body) * scale;
  // The bar's padding and border, the message's padding, the title's line and the action's row.
  const chrome =
    spacing[1] * 2 +
    2 +
    spacing[2] * 2 +
    (title ? SNACKBAR_TITLE_LINES * titleLine + 2 : 0) +
    (action && stacked ? 44 : 0);
  const fits = Math.floor((windowHeight * SNACKBAR_MAX_WINDOW_SHARE - chrome) / line);
  const bound = Math.max(2, fits);
  return { stacked, textLines: title ? (stacked ? Math.min(3, bound) : 1) : bound };
}

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
  /**
   * A screen with a bar at its bottom (the main button of a form) keeps the toast above it while
   * the screen is mounted: the bar's height in points; returns the release.
   */
  keepClear: (height: number) => () => void;
}

const SnackbarContext = createContext<Snackbar | null>(null);
/** How far up from the bottom of the screen the toast showing now reaches; 0 without one. */
const SnackbarCoverContext = createContext(0);

/**
 * App-wide toast (the web's MatSnackBar; owner spec 2026-10-14, section 3): one message at a time
 * at the bottom of the screen, about five seconds, with an optional action ("Undo", "View").
 * Announced to screen readers; the message itself dismisses it with a tap.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  // The toast's top, in points from the bottom of the screen, once laid out.
  const [cover, setCover] = useState(0);
  const nextId = useRef(1);
  // The bottom bars that asked for room, the latest last (a screen on top of another).
  const [clearances, setClearances] = useState<readonly { id: number; height: number }[]>([]);
  const nextClearance = useRef(1);
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

  const keepClear = useCallback((height: number) => {
    const id = nextClearance.current++;
    setClearances((current) => [...current, { id, height }]);
    return () => setClearances((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const value = useMemo<Snackbar>(() => ({ show, hide, keepClear }), [show, hide, keepClear]);
  const clearance = clearances[clearances.length - 1]?.height ?? 0;

  return (
    <SnackbarContext.Provider value={value}>
      <SnackbarCoverContext.Provider value={message ? cover : 0}>
        {children}
      </SnackbarCoverContext.Provider>
      {message ? (
        <SnackbarView
          key={message.id}
          message={message}
          clearance={clearance}
          onDismiss={hide}
          onCover={setCover}
        />
      ) : null}
    </SnackbarContext.Provider>
  );
}

/** The keyboard's height on iOS now (0 when it is down), from the keyboard's own metrics. */
function iosKeyboardHeight(): number {
  if (Platform.OS !== 'ios') {
    return 0;
  }
  try {
    return Keyboard.isVisible?.() ? (Keyboard.metrics?.()?.height ?? 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * How much of the bottom of the screen the keyboard covers on iOS, where the window does not
 * resize for it (stage R4, review fix 1, F2: a toast and its "Undo" were drawn under the keys).
 * Android resizes the window for the keyboard (adjustResize), so the toast's place already clears
 * it there, as the bottom sheets assume.
 */
function useKeyboardCover(): number {
  const [height, setHeight] = useState(iosKeyboardHeight);
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }
    // iOS sends "will show" again when the keyboard changes size while it is up.
    const shown = Keyboard.addListener('keyboardWillShow', (event) =>
      setHeight(event.endCoordinates.height)
    );
    const hidden = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

function SnackbarView({
  message,
  clearance,
  onDismiss,
  onCover,
}: {
  message: SnackbarMessage;
  clearance: number;
  onDismiss: () => void;
  /** Where the toast's top is, in points from the bottom of the screen. */
  onCover: (cover: number) => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // At large text sizes the action goes under the text, which keeps the width of the toast
  // (side by side, "Saved" broke in the middle of the word); the words are capped and keep the
  // toast within a quarter of the window (owner decision of 2026-10-28).
  const { stacked, textLines } = toastLayout(window.height, window.fontScale, {
    title: !!message.title,
    action: !!message.action,
  });
  // Above the tab bar, or above the bottom bar of a form screen, and above the keyboard.
  const keyboard = useKeyboardCover();
  const bottom = Math.max(
    insets.bottom + spacing[16],
    clearance + spacing[2],
    keyboard > 0 ? keyboard + spacing[2] : 0
  );
  const [height, setHeight] = useState(0);
  useEffect(() => {
    onCover(height > 0 ? bottom + height : 0);
  }, [bottom, height, onCover]);
  const error = message.tone === 'error';
  const ink = error ? palette.background : palette.ink;
  const muted = error ? palette.background : palette.textMuted;
  const spoken = [message.title, message.text].filter(Boolean).join(', ');
  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => setHeight(Math.ceil(event.nativeEvent.layout.height))}
      testID="snackbar-area"
      style={[styles.wrap, { bottom }]}
    >
      <View
        testID="snackbar"
        style={[
          styles.bar,
          stacked && styles.barStacked,
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
          style={[styles.message, stacked && styles.messageStacked]}
        >
          {message.icon ? <ToastIcon icon={message.icon} /> : null}
          <View style={styles.texts}>
            {message.title ? (
              <Text
                numberOfLines={SNACKBAR_TITLE_LINES}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                maxFontSizeMultiplier={SNACKBAR_MAX_FONT_SCALE}
                testID="snackbar-title"
                style={[textStyle('md'), styles.title, { color: ink }]}
              >
                {message.title}
              </Text>
            ) : null}
            <Text
              numberOfLines={textLines}
              maxFontSizeMultiplier={SNACKBAR_MAX_FONT_SCALE}
              testID="snackbar-text"
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
            style={({ pressed }) => [
              styles.action,
              stacked && styles.actionStacked,
              pressed && styles.pressed,
            ]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={SNACKBAR_MAX_FONT_SCALE}
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

/**
 * How far up from the bottom of the screen the toast showing now reaches, in points (0 without a
 * toast, or before it is laid out): a screen keeps the end of its content clear of it.
 */
export function useSnackbarCover(): number {
  return useContext(SnackbarCoverContext);
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
  barStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  message: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 44,
    paddingVertical: spacing[2],
  },
  messageStacked: { flex: 0 },
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
  actionStacked: { alignSelf: 'flex-end' },
  actionLabel: { fontWeight: fontWeight.bold },
  pressed: { opacity: 0.7 },
});
