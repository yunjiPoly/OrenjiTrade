import { MaterialCommunityIcons } from '@expo/vector-icons';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { useEffect } from 'react';
import {
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
import {
  Checkbox,
  FormMessage,
  PasswordField,
  RadioGroup,
  SwitchRow,
} from '@/src/components/ui/FormControls';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen, ownSafeBottom } from '@/src/components/ui/Screen';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Stepper } from '@/src/components/ui/Stepper';

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
    renderWithProviders(<CardDataCredit game="pokemon" testID="none" />);
    expect(screen.queryByTestId('none')).toBeNull();
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
