import { MaterialCommunityIcons } from '@expo/vector-icons';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { useEffect } from 'react';
import {
  AccessibilityInfo,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
} from 'react-native';

import { ApiError } from '@/src/api/ApiError';
import { Button } from '@/src/components/ui/Button';
import { CardDataCredit, CardImage } from '@/src/components/ui/CardImage';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import {
  Checkbox,
  FormMessage,
  PasswordField,
  RadioGroup,
  SwitchRow,
} from '@/src/components/ui/FormControls';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen, keyboardBehavior, ownSafeBottom } from '@/src/components/ui/Screen';
import { HandleText } from '@/src/components/ui/HandleText';
import { ListRow } from '@/src/components/ui/Layout';
import { PillButton } from '@/src/components/ui/PillButton';
import {
  SNACKBAR_MAX_FONT_SCALE,
  SNACKBAR_MAX_WINDOW_SHARE,
  SNACKBAR_TITLE_LINES,
  toastLayout,
  useSnackbar,
} from '@/src/components/ui/Snackbar';
import { StateScroll } from '@/src/components/ui/StateScroll';
import { Stepper } from '@/src/components/ui/Stepper';

import { SharedLinkCard } from '@/src/features/messages/LinkCards';
import { SaleMessage } from '@/src/features/messages/SaleMessage';
import { HANDLE_MAX } from '@/src/lib/profile';
import { HANDLE_MAX_FONT_SCALE, PINNED_MAX_FONT_SCALE, fontSize } from '@/src/theme';
import { darkPalette } from '@/src/theme/palette';

import { renderWithProviders } from '../test-utils';

/** WCAG contrast of two `#RRGGBB` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channel = (offset: number) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('CardImage', () => {
  it('renders an API picture with a skeleton until it loads', () => {
    renderWithProviders(<CardImage src="/api/v1/public/card-images/42" alt="Dark Magician" />);
    expect(screen.getByLabelText('Dark Magician')).toBeOnTheScreen();
    expect(screen.getByTestId('card-image-img').props.source).toEqual([
      { uri: 'http://localhost:8080/api/v1/public/card-images/42' },
    ]);
    expect(
      screen.getByTestId('card-image-skeleton', { includeHiddenElements: true })
    ).toBeOnTheScreen();
    fireEvent(screen.getByTestId('card-image-img'), 'load', { nativeEvent: {} });
    expect(screen.queryByTestId('card-image-skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('shows the placeholder for a provider URL (never hotlinked) or a broken picture', () => {
    renderWithProviders(
      <CardImage
        src="https://images.ygoprodeck.com/images/cards/1.jpg"
        alt="Blue-Eyes"
        game="yugioh"
        testID="hotlink"
      />
    );
    expect(screen.getByTestId('hotlink-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('hotlink-img')).toBeNull();
  });

  it('falls back to the placeholder when the picture fails to load', () => {
    renderWithProviders(
      <CardImage src="/api/v1/public/card-images/7" alt="Pikachu" game="pokemon" />
    );
    fireEvent(screen.getByTestId('card-image-img'), 'error', {
      nativeEvent: { error: 'HTTP 404' },
    });
    expect(screen.getByTestId('card-image-placeholder')).toBeOnTheScreen();
  });

  it('credits the provider of a game catalog', () => {
    renderWithProviders(<CardDataCredit game="yugioh" />);
    expect(screen.getByText('YGOPRODeck')).toBeOnTheScreen();
    renderWithProviders(<CardDataCredit game="riftbound" testID="none" />);
    expect(screen.queryByTestId('none')).toBeNull();
  });

  it('credits Scryfall and TCGdex with their notices (stage R10)', () => {
    renderWithProviders(<CardDataCredit game="mtg" testID="magic-credit" />);
    expect(screen.getByTestId('magic-credit')).toHaveTextContent(
      /Card data and images courtesy of Scryfall\./
    );
    expect(screen.getByTestId('magic-credit')).toHaveTextContent(/Fan Content Policy/);
    renderWithProviders(<CardDataCredit game="pokemon" testID="pokemon-credit" />);
    expect(screen.getByTestId('pokemon-credit')).toHaveTextContent(
      /Card data courtesy of TCGdex \(MIT licence\)\./
    );
    expect(screen.getByTestId('pokemon-credit')).toHaveTextContent(/GAME FREAK/);
    expect(screen.getByRole('link', { name: 'TCGdex' })).toBeOnTheScreen();
  });
});

describe('Screen', () => {
  it('keeps scrolling forms above the on-screen keyboard', () => {
    renderWithProviders(
      <Screen scroll testID="screen-form">
        <Text>Form</Text>
      </Screen>
    );
    const avoiding = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(avoiding.props.behavior).toBe('padding');
    const scroll = within(avoiding).UNSAFE_getByType(ScrollView);
    expect(scroll.props.testID).toBe('screen-form');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(false);
  });

  it('lets a form whose fields sit low scroll the field being typed in above the keyboard on iOS', () => {
    // Sign in, Create account and Reset password (stage R12's review fix 1): at the largest text
    // sizes the KeyboardAvoidingView's padding left the focused field under the keyboard.
    renderWithProviders(
      <Screen scroll keyboardFollowsFocus testID="screen-form">
        <Text>Form</Text>
      </Screen>
    );
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBeUndefined();
    expect(screen.getByTestId('screen-form').props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(keyboardBehavior('ios', true)).toBeUndefined();
    expect(keyboardBehavior('ios', false)).toBe('padding');
    // Android is edge to edge (SDK 57): the window does not resize, the padding stays.
    expect(keyboardBehavior('android', true)).toBe('padding');
    expect(keyboardBehavior('web', false)).toBeUndefined();
  });

  it('adds the home-indicator inset once: iOS already makes it for a scrolling screen', () => {
    const inset = { safeBottom: true, insetBottom: 34 };
    expect(ownSafeBottom('ios', { ...inset, scroll: true })).toBe(0);
    expect(ownSafeBottom('ios', { ...inset, scroll: false })).toBe(34);
    // Android and the web have no automatic adjustment: unchanged.
    expect(ownSafeBottom('android', { ...inset, scroll: true })).toBe(34);
    expect(ownSafeBottom('web', { ...inset, scroll: true })).toBe(34);
    expect(ownSafeBottom('android', { scroll: true, safeBottom: false, insetBottom: 34 })).toBe(0);
  });

  it('renders a plain container without scrolling', () => {
    renderWithProviders(
      <Screen testID="screen-plain">
        <Text>Plain</Text>
      </Screen>
    );
    expect(screen.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
    expect(screen.getByText('Plain')).toBeOnTheScreen();
  });
});

describe('StateScroll', () => {
  it('lets a screen-filling state scroll instead of running over the screen at large text sizes', () => {
    renderWithProviders(
      <StateScroll testID="state-scroll">
        <EmptyState testID="state-closed" title="Closed" description="Come back later." />
      </StateScroll>
    );
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.testID).toBe('state-scroll');
    // The content grows to the screen (the state stays centred while it fits) and past it.
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(
      within(screen.getByTestId('state-scroll')).getByTestId('state-closed')
    ).toHaveTextContent(/Closed.*Come back later\./);
  });
});

describe('QueryState', () => {
  const base = {
    data: undefined,
    error: null,
    isPending: true,
    isFetching: true,
    refetch: jest.fn(),
  };

  it('shows the loading state, then the content', () => {
    const { rerender } = renderWithProviders(
      <QueryState query={base} testID="q">
        {(data: string) => <Text>{data}</Text>}
      </QueryState>
    );
    expect(screen.getByTestId('q-loading')).toBeOnTheScreen();
    rerender(
      <QueryState query={{ ...base, data: 'Loaded', isPending: false }} testID="q">
        {(data: string) => <Text>{data}</Text>}
      </QueryState>
    );
    expect(screen.getByText('Loaded')).toBeOnTheScreen();
  });

  it('shows an error with retry when nothing is cached', () => {
    const refetch = jest.fn();
    renderWithProviders(
      <QueryState
        query={{
          ...base,
          isPending: false,
          isFetching: false,
          refetch,
          error: ApiError.network(new Error('x')),
        }}
        errorTitle="We could not load your profile"
        testID="q"
      >
        {() => <Text>never</Text>}
      </QueryState>
    );
    expect(screen.getByText('You appear to be offline')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps showing cached data when a refresh fails (offline tolerance)', () => {
    renderWithProviders(
      <QueryState
        query={{
          ...base,
          data: 'Cached',
          isPending: false,
          error: ApiError.network(new Error('x')),
        }}
      >
        {(data: string) => <Text>{data}</Text>}
      </QueryState>
    );
    expect(screen.getByText('Cached')).toBeOnTheScreen();
  });

  it('shows the empty state', () => {
    renderWithProviders(
      <QueryState
        query={{ ...base, data: [] as string[], isPending: false }}
        isEmpty={(data) => data.length === 0}
        empty={{ title: 'Nothing here yet' }}
        testID="q"
      >
        {() => <Text>list</Text>}
      </QueryState>
    );
    expect(screen.getByTestId('q-empty')).toBeOnTheScreen();
    expect(screen.getByText('Nothing here yet')).toBeOnTheScreen();
  });
});

describe('form controls', () => {
  it('toggles a checkbox and a switch row with accessible state', () => {
    const onCheck = jest.fn();
    const onSwitch = jest.fn();
    renderWithProviders(
      <>
        <Checkbox label="Accept all" checked={false} onChange={onCheck} />
        <SwitchRow label="Show me on the map" value onChange={onSwitch} help="Off by default." />
      </>
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Accept all' });
    expect(checkbox).not.toBeChecked();
    fireEvent.press(checkbox);
    expect(onCheck).toHaveBeenCalledWith(true);
    const toggle = screen.getByRole('switch', { name: 'Show me on the map' });
    expect(toggle).toBeChecked();
    fireEvent.press(toggle);
    expect(onSwitch).toHaveBeenCalledWith(false);
  });

  it('draws a switch that is off so it can be seen in dark (a white thumb on the off track)', () => {
    renderWithProviders(
      <SwitchRow label="Show me on the map" value={false} onChange={jest.fn()} />,
      {
        scheme: 'dark',
      }
    );
    const native = screen.UNSAFE_getByType(Switch);
    expect(native.props.thumbColor).toBe('#FFFFFF');
    expect(native.props.trackColor.false).toBe(darkPalette.borderStrong);
    expect(contrast(native.props.thumbColor, darkPalette.borderStrong)).toBeGreaterThan(3);
    expect(contrast(native.props.thumbColor, darkPalette.surface)).toBeGreaterThan(3);
  });

  it.each([
    [1, 'row' as const],
    [3.1, 'column' as const],
  ])(
    'puts a switch beside its words, under them at large text sizes (text size %s)',
    (fontScale, direction) => {
      const window = Dimensions.get('window');
      act(() => {
        Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } });
      });
      try {
        renderWithProviders(
          <SwitchRow
            label="Show me on the map"
            help="Collectors of Americas (North) can find your public binders in Quebec."
            value={false}
            onChange={jest.fn()}
            testID="switch-row"
          />
        );
        expect(screen.getByTestId('switch-row')).toHaveStyle({ flexDirection: direction });
      } finally {
        act(() => {
          Dimensions.set({ window, screen: window });
        });
      }
    }
  );

  it('selects a radio option', () => {
    const onChange = jest.fn();
    renderWithProviders(
      <RadioGroup
        label="Who can see your profile"
        value="MEMBERS"
        onChange={onChange}
        options={[
          { value: 'PUBLIC', label: 'Public' },
          { value: 'MEMBERS', label: 'Members' },
        ]}
      />
    );
    expect(screen.getByRole('radio', { name: 'Members' })).toBeChecked();
    fireEvent.press(screen.getByRole('radio', { name: 'Public' }));
    expect(onChange).toHaveBeenCalledWith('PUBLIC');
  });

  it('reveals a password on demand and shows inline errors', () => {
    renderWithProviders(
      <PasswordField
        label="Password"
        value="secret"
        onChangeText={jest.fn()}
        error="Enter your password."
      />
    );
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
  });

  it('renders form messages as alerts', () => {
    renderWithProviders(<FormMessage testID="msg">Something failed.</FormMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent(/Something failed\./);
  });

  it('keeps the icon of a form message out of its spoken name (iOS reads the children)', () => {
    renderWithProviders(<FormMessage testID="msg">Something failed.</FormMessage>);
    const icon = screen.UNSAFE_getByType(MaterialCommunityIcons);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
  });

  it('steps a value within its bounds', () => {
    const onChange = jest.fn();
    const { rerender } = renderWithProviders(
      <Stepper
        label="Copies"
        value={10}
        min={1}
        max={50}
        next={(current, direction) => current + direction * 5}
        onChange={onChange}
        format={(v) => `${v} copies`}
      />
    );
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('10 copies');
    fireEvent.press(screen.getByRole('button', { name: 'Increase copies' }));
    expect(onChange).toHaveBeenLastCalledWith(15);
    rerender(<Stepper label="Copies" value={50} min={1} max={50} onChange={onChange} />);
    fireEvent.press(screen.getByRole('button', { name: 'Increase copies' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('blocks presses while a button is loading', () => {
    const onPress = jest.fn();
    renderWithProviders(<Button label="Save" loading loadingLabel="Saving…" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('confirms or cancels', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    renderWithProviders(
      <ConfirmDialog
        visible
        title="Remove your location?"
        message="You will disappear from the map."
        confirmLabel="Remove location"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText('Remove your location?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders nothing when hidden', () => {
    renderWithProviders(
      <ConfirmDialog
        visible={false}
        title="Hidden"
        message=""
        confirmLabel="OK"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

describe('Snackbar', () => {
  function Trigger() {
    const snackbar = useSnackbar();
    return <Text onPress={() => snackbar.show('Profile saved.', { duration: 1000 })}>show</Text>;
  }

  it('shows one message, hides it after its duration or on tap', () => {
    jest.useFakeTimers();
    try {
      renderWithProviders(<Trigger />);
      fireEvent.press(screen.getByText('show'));
      expect(screen.getByTestId('snackbar')).toHaveTextContent('Profile saved.');
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.queryByTestId('snackbar')).toBeNull();
      fireEvent.press(screen.getByText('show'));
      fireEvent.press(screen.getByTestId('snackbar-message'));
      expect(screen.queryByTestId('snackbar')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  function FormScreenTrigger() {
    const snackbar = useSnackbar();
    useEffect(() => snackbar.keepClear(120), [snackbar]);
    return <Text onPress={() => snackbar.show('Card saved.')}>save</Text>;
  }

  it('sits above the bottom bar of a form screen while it is mounted (stage R2)', () => {
    const { unmount } = renderWithProviders(<FormScreenTrigger />);
    fireEvent.press(screen.getByText('save'));
    let node = screen.getByTestId('snackbar').parent;
    while (node && StyleSheet.flatten(node.props.style)?.bottom === undefined) {
      node = node.parent;
    }
    // The tab bar's place (the bottom inset + 64) is lower than the bar's 120 + 8.
    expect(StyleSheet.flatten(node?.props.style).bottom).toBe(128);
    unmount();
  });

  /** The `bottom` of the toast's positioned wrapper. */
  function toastBottom(): number | undefined {
    let node = screen.getByTestId('snackbar').parent;
    while (node && StyleSheet.flatten(node.props.style)?.bottom === undefined) {
      node = node.parent;
    }
    return StyleSheet.flatten(node?.props.style)?.bottom as number | undefined;
  }

  it('sits above the iOS keyboard, which the window does not make room for (R4 review F2)', () => {
    expect(Platform.OS).toBe('ios');
    const listeners = new Map<string, (event: { endCoordinates: { height: number } }) => void>();
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
      listeners.set(name, listener as never);
      return { remove: () => listeners.delete(name) } as never;
    });
    try {
      renderWithProviders(<FormScreenTrigger />);
      fireEvent.press(screen.getByText('save'));
      expect(toastBottom()).toBe(128);
      // The message box takes the keyboard back while the toast shows: the toast rises above it.
      act(() => listeners.get('keyboardWillShow')?.({ endCoordinates: { height: 336 } }));
      expect(toastBottom()).toBe(344);
      act(() => listeners.get('keyboardWillHide')?.({ endCoordinates: { height: 0 } }));
      expect(toastBottom()).toBe(128);
    } finally {
      addListener.mockRestore();
    }
  });

  it('starts above a keyboard that is already up (R4 review F2)', () => {
    const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const metrics = jest
      .spyOn(Keyboard, 'metrics')
      .mockReturnValue({ height: 300, screenX: 0, screenY: 512, width: 402 });
    try {
      renderWithProviders(<FormScreenTrigger />);
      fireEvent.press(screen.getByText('save'));
      expect(toastBottom()).toBe(308);
    } finally {
      visible.mockRestore();
      metrics.mockRestore();
    }
  });

  function ActionTrigger({ onUndo }: { onUndo: () => void }) {
    const snackbar = useSnackbar();
    return (
      <Text
        onPress={() =>
          snackbar.show('Ash Blossom & Joyous Spring', {
            title: 'Card deleted',
            icon: 'deleted',
            action: { label: 'Undo', onPress: onUndo, testID: 'snackbar-undo' },
          })
        }
      >
        delete
      </Text>
    );
  }

  it('stays about five seconds with a title, the card and one action (stage R2)', () => {
    jest.useFakeTimers();
    const onUndo = jest.fn();
    try {
      renderWithProviders(<ActionTrigger onUndo={onUndo} />);
      fireEvent.press(screen.getByText('delete'));
      expect(screen.getByTestId('snackbar')).toHaveTextContent(
        /Card deletedAsh Blossom & Joyous SpringUndo$/
      );
      expect(screen.getByTestId('snackbar-message').props.accessibilityLabel).toBe(
        'Card deleted, Ash Blossom & Joyous Spring'
      );
      expect(screen.getByTestId('snackbar-undo').props.accessibilityLabel).toBe(
        'Undo, Card deleted, Ash Blossom & Joyous Spring'
      );
      act(() => {
        jest.advanceTimersByTime(4900);
      });
      expect(screen.getByTestId('snackbar')).toBeTruthy();
      fireEvent.press(screen.getByTestId('snackbar-undo'));
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('snackbar')).toBeNull();

      fireEvent.press(screen.getByText('delete'));
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.queryByTestId('snackbar')).toBeNull();
      expect(onUndo).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the largest text sizes: handles and toasts (owner decision of 2026-10-28)', () => {
  const WINDOW = Dimensions.get('window');
  /** Sets the system text size (Jest's React Native starts at 2); put back after each test. */
  function textSize(fontScale: number) {
    act(() => {
      Dimensions.set({
        window: { ...WINDOW, width: 402, height: 874, fontScale },
        screen: { ...WINDOW, width: 402, height: 874, fontScale },
      });
    });
  }
  afterEach(() => {
    act(() => {
      Dimensions.set({ window: WINDOW, screen: WINDOW });
    });
  });

  // The longest handle the API allows: 24 characters of [a-z0-9_].
  const LONGEST = 'collector_ab12cd34ef56gh';

  it.each([1, 3.1])(
    'draws a handle on one line, capped, cut with "…" rather than broken or shrunk (text size %s)',
    (fontScale) => {
      textSize(fontScale);
      renderWithProviders(<HandleText testID="handle">{LONGEST}</HandleText>);
      const handle = screen.getByTestId('handle');
      expect(LONGEST).toHaveLength(HANDLE_MAX);
      expect(handle).toHaveTextContent(LONGEST);
      expect(handle).toHaveProp('numberOfLines', 1);
      expect(handle).toHaveProp('maxFontSizeMultiplier', HANDLE_MAX_FONT_SCALE);
      expect(handle).toHaveProp('ellipsizeMode', 'tail');
      // Never shrunk to fit (review fix 2, R1-1): React Native 0.86 ignores `minimumFontScale`
      // on iOS and Android and shrinks down to 4 points.
      expect(handle.props.adjustsFontSizeToFit).toBeUndefined();
      expect(handle.props.minimumFontScale).toBeUndefined();
    }
  );

  it('lets a line led by a handle take two lines, still capped', () => {
    textSize(3.1);
    renderWithProviders(
      <HandleText numberOfLines={2} testID="line">
        @{LONGEST} · Newfoundland and Labrador
      </HandleText>
    );
    expect(screen.getByTestId('line')).toHaveProp('numberOfLines', 2);
    expect(screen.getByTestId('line')).toHaveProp('maxFontSizeMultiplier', HANDLE_MAX_FONT_SCALE);
  });

  it('keeps the longest handle of ordinary letters within a row beside an avatar at the cap', () => {
    // Inter's lowercase letters and digits average about 0.56 em; a row is the 402 pt phone less
    // its 16 pt sides, a 44 pt avatar and a 12 pt gap.
    const width = HANDLE_MAX * 0.56 * fontSize.md * HANDLE_MAX_FONT_SCALE;
    expect(width).toBeLessThanOrEqual(402 - 2 * 16 - 44 - 12);
  });

  function LongToast({ title, action }: { title?: string; action?: boolean }) {
    const snackbar = useSnackbar();
    return (
      <Text
        onPress={() =>
          snackbar.show(
            'You cannot message this collector. They may have blocked messages or you blocked them, or this collector cannot receive messages right now.',
            {
              ...(title ? { title } : {}),
              ...(action
                ? { action: { label: 'View', onPress: jest.fn(), testID: 'snackbar-view' } }
                : {}),
            }
          )
        }
      >
        show
      </Text>
    );
  }

  it.each([1, 3.1])(
    'holds a toast within a quarter of the window, readable, with its action (text size %s)',
    (fontScale) => {
      jest.useFakeTimers();
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      try {
        textSize(fontScale);
        renderWithProviders(<LongToast action />);
        fireEvent.press(screen.getByText('show'));
        const text = screen.getByTestId('snackbar-text');
        expect(text).toHaveProp('maxFontSizeMultiplier', SNACKBAR_MAX_FONT_SCALE);
        const layout = toastLayout(874, fontScale, { title: false, action: true });
        expect(text).toHaveProp('numberOfLines', layout.textLines);
        expect(layout.textLines).toBeGreaterThanOrEqual(2);
        // The action stays, under the words at the largest size, and its words are capped too.
        const view = screen.getByTestId('snackbar-view');
        expect(within(view).getByText('View')).toHaveProp(
          'maxFontSizeMultiplier',
          SNACKBAR_MAX_FONT_SCALE
        );
        expect(layout.stacked).toBe(fontScale > 1.3);
        // VoiceOver hears the whole message, however many lines show.
        expect(announce).toHaveBeenCalledWith(
          expect.stringMatching(/receive messages right now\.\. View$/)
        );
        expect(screen.getByTestId('snackbar-message').props.accessibilityLabel).toMatch(
          /receive messages right now\.$/
        );
        // About five seconds, as before.
        act(() => {
          jest.advanceTimersByTime(4900);
        });
        expect(screen.getByTestId('snackbar')).toBeTruthy();
        act(() => {
          jest.advanceTimersByTime(200);
        });
        expect(screen.queryByTestId('snackbar')).toBeNull();
      } finally {
        announce.mockRestore();
        jest.useRealTimers();
      }
    }
  );

  it('caps a toast with a title and an action at the largest size', () => {
    textSize(3.1);
    renderWithProviders(<LongToast title="Card deleted" action />);
    fireEvent.press(screen.getByText('show'));
    const title = screen.getByTestId('snackbar-title');
    expect(title).toHaveProp('maxFontSizeMultiplier', SNACKBAR_MAX_FONT_SCALE);
    // One line, its end cut rather than shrunk (review fix 2, R1-1: no floor above 4 points).
    expect(title).toHaveProp('numberOfLines', SNACKBAR_TITLE_LINES);
    expect(title).toHaveProp('ellipsizeMode', 'tail');
    expect(title.props.adjustsFontSizeToFit).toBeUndefined();
    expect(title.props.minimumFontScale).toBeUndefined();
    expect(screen.getByTestId('snackbar-text')).toHaveProp('numberOfLines', 3);
  });

  it('keeps a confirmation’s buttons in reach and the handle in its title on one line (largest size)', () => {
    textSize(3.1);
    renderWithProviders(
      <ConfirmDialog
        visible
        title={`Block ${LONGEST}?`}
        handleInTitle
        message={'You will stop seeing each other. '.repeat(12)}
        confirmLabel="Block"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        testID="block-dialog"
      />
    );
    expectHandleLine(screen.getByText(`Block ${LONGEST}?`));
    // The words scroll within the window; the buttons sit under them, outside the scroll.
    const scroll = screen.getByTestId('block-dialog-scroll');
    expect(StyleSheet.flatten(screen.getByTestId('block-dialog').props.style).maxHeight).toBe(
      874 - 2 * (24 + 48)
    );
    expect(within(scroll).queryByTestId('block-dialog-confirm')).toBeNull();
    expect(screen.getByTestId('block-dialog-confirm')).toBeOnTheScreen();
  });

  /**
   * Review fix 1 (F8): the height a toast takes, read from what is rendered (every text's lines,
   * line height and cap, the bar's and the message's padding, the stacked action's row), not
   * from `toastLayout`'s own sum.
   */
  function renderedToastHeight(fontScale: number) {
    const lines = (testID: string) => {
      const text = screen.getByTestId(testID);
      const style = StyleSheet.flatten(text.props.style);
      const scale = Math.min(Math.max(fontScale, 1), text.props.maxFontSizeMultiplier ?? fontScale);
      return text.props.numberOfLines * style.lineHeight * scale;
    };
    const bar = StyleSheet.flatten(screen.getByTestId('snackbar').props.style);
    const message = StyleSheet.flatten(screen.getByTestId('snackbar-message').props.style);
    const title = screen.queryByTestId('snackbar-title') ? lines('snackbar-title') + 2 : 0;
    const words = title + lines('snackbar-text') + 2 * message.paddingVertical;
    const action = screen.queryByTestId('snackbar-view') ? 44 : 0;
    const stacked = bar.flexDirection === 'column';
    return (
      2 * bar.paddingVertical +
      2 * bar.borderWidth +
      (stacked ? Math.max(words, 44) + action : Math.max(words, 44, action))
    );
  }

  it.each([
    [667, 3.1],
    [874, 3.1],
    [956, 3.1],
    [874, 2],
    [874, 1],
  ])(
    'never lets a rendered toast reach past a quarter of a %s pt window at text size %s',
    (height, scale) => {
      for (const title of [undefined, 'Card deleted']) {
        for (const action of [false, true]) {
          act(() => {
            Dimensions.set({
              window: { ...WINDOW, width: 402, height, fontScale: scale },
              screen: { ...WINDOW, width: 402, height, fontScale: scale },
            });
          });
          const view = renderWithProviders(<LongToast title={title} action={action} />);
          fireEvent.press(screen.getByText('show'));
          if (title) {
            expect(screen.getByTestId('snackbar-title')).toHaveProp(
              'numberOfLines',
              SNACKBAR_TITLE_LINES
            );
          }
          expect(renderedToastHeight(scale)).toBeLessThanOrEqual(
            height * SNACKBAR_MAX_WINDOW_SHARE
          );
          view.unmount();
        }
      }
    }
  );

  // Review fix 1 (U1, U3, F5, F7): a label that names a handle stays on one line, capped, its
  // end cut with "…" where its button or row is too narrow, at the largest size as at the default
  // one; never shrunk to fit (review fix 2, R1-1).
  function expectHandleLine(text: ReturnType<typeof screen.getByText>) {
    expect(text).toHaveProp('numberOfLines', 1);
    expect(text).toHaveProp('ellipsizeMode', 'tail');
    expect(text).toHaveProp('maxFontSizeMultiplier', HANDLE_MAX_FONT_SCALE);
    expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    expect(text.props.minimumFontScale).toBeUndefined();
  }

  it.each([1, 3.1])(
    'keeps the handle of a button, a pill and a sheet row on one line (text size %s)',
    (fontScale) => {
      textSize(fontScale);
      renderWithProviders(
        <>
          <Button label={`Message ${LONGEST}`} handleInLabel icon="message-text-outline" />
          <PillButton label={`Message ${LONGEST}`} handleInLabel icon="message-outline" />
          <ListRow label={`Report ${LONGEST}`} handleInLabel kind="button" onPress={jest.fn()} />
          <ListRow label="Notifications" />
        </>
      );
      const [button, pill] = screen.getAllByText(`Message ${LONGEST}`);
      expectHandleLine(button!);
      expectHandleLine(pill!);
      expect(StyleSheet.flatten(button!.props.style).flexShrink).toBe(1);
      expect(StyleSheet.flatten(pill!.props.style).flexShrink).toBe(1);
      expectHandleLine(screen.getByText(`Report ${LONGEST}`));
      // A label without a handle keeps growing.
      expect(screen.getByText('Notifications').props.maxFontSizeMultiplier).toBeUndefined();
    }
  );

  it('keeps "Rate {handle}" and a binder link\'s "by @{handle}" on one line (largest size)', () => {
    textSize(3.1);
    renderWithProviders(
      <>
        <SaleMessage
          sale={{
            saleId: 's-1',
            sellerId: 'seller',
            buyerId: 'buyer',
            kind: 'CARD',
            name: 'Lantern Fox',
            quantity: 1,
            trackingNumber: null,
            undone: false,
          }}
          selfId="buyer"
          otherHandle={LONGEST}
          onRate={jest.fn()}
        />
        <SharedLinkCard binder={{ id: 'b-1', name: 'Trade binder', ownerHandle: LONGEST }} />
      </>
    );
    expectHandleLine(screen.getByTestId('sale-message-rate-label'));
    expect(screen.getByTestId('sale-message-rate-label')).toHaveTextContent(`Rate ${LONGEST}`);
    expectHandleLine(screen.getByTestId('binder-link-owner'));
    expect(screen.getByTestId('binder-link-owner')).toHaveTextContent(`by @${LONGEST}`);
  });

  it.each([
    [1, 'row'],
    [3.1, 'column-reverse'],
  ])(
    "caps a confirmation's buttons and stacks them at large sizes (text size %s)",
    (fontScale, direction) => {
      textSize(fontScale);
      renderWithProviders(
        <ConfirmDialog
          visible
          title="Remove this card?"
          message="It leaves your binder."
          confirmLabel="Remove"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          testID="remove-dialog"
        />
      );
      for (const label of ['Cancel', 'Remove']) {
        expect(within(screen.getByTestId('remove-dialog')).getByText(label)).toHaveProp(
          'maxFontSizeMultiplier',
          PINNED_MAX_FONT_SCALE
        );
      }
      expect(
        StyleSheet.flatten(screen.getByTestId('remove-dialog-actions').props.style).flexDirection
      ).toBe(direction);
    }
  );
});
