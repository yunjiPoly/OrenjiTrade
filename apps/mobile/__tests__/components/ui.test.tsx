import { act, fireEvent, screen } from '@testing-library/react-native';
import { KeyboardAvoidingView, Text } from 'react-native';
import type { TestInstance } from 'test-renderer';

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
import { Screen } from '@/src/components/ui/Screen';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Stepper } from '@/src/components/ui/Stepper';
import { nextRadius } from '@/src/lib/location';

import { renderWithProviders } from '../test-utils';

describe('CardImage', () => {
  it('renders an API picture with a skeleton until it loads', async () => {
    await renderWithProviders(
      <CardImage src="/api/v1/public/card-images/42" alt="Dark Magician" />
    );
    expect(screen.getByLabelText('Dark Magician')).toBeOnTheScreen();
    expect(screen.getByTestId('card-image-img').props.source).toEqual([
      { uri: 'http://localhost:8080/api/v1/public/card-images/42' },
    ]);
    expect(
      screen.getByTestId('card-image-skeleton', { includeHiddenElements: true })
    ).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('card-image-img'), 'load', { nativeEvent: {} });
    expect(screen.queryByTestId('card-image-skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('shows the placeholder for a provider URL (never hotlinked) or a broken picture', async () => {
    await renderWithProviders(
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

  it('falls back to the placeholder when the picture fails to load', async () => {
    await renderWithProviders(
      <CardImage src="/api/v1/public/card-images/7" alt="Pikachu" game="pokemon" />
    );
    await fireEvent(screen.getByTestId('card-image-img'), 'error', {
      nativeEvent: { error: 'HTTP 404' },
    });
    expect(screen.getByTestId('card-image-placeholder')).toBeOnTheScreen();
  });

  it('credits the provider of a game catalog', async () => {
    await renderWithProviders(<CardDataCredit game="yugioh" />);
    expect(screen.getByText('YGOPRODeck')).toBeOnTheScreen();
    await renderWithProviders(<CardDataCredit game="pokemon" testID="none" />);
    expect(screen.queryByTestId('none')).toBeNull();
  });
});

describe('Screen', () => {
  /**
   * The props of the nearest component of `type` around a rendered element. Queries return host
   * elements only since Testing Library 14 (no more `UNSAFE_getByType`), so this walks up the
   * element's React fiber to the composite `KeyboardAvoidingView`.
   */
  function enclosingProps(element: TestInstance, type: unknown): Record<string, unknown> | null {
    for (let fiber = element.unstable_fiber; fiber; fiber = fiber.return) {
      if (fiber.type === type) {
        return fiber.memoizedProps as Record<string, unknown>;
      }
    }
    return null;
  }

  it('keeps scrolling forms above the on-screen keyboard', async () => {
    await renderWithProviders(
      <Screen scroll testID="screen-form">
        <Text>Form</Text>
      </Screen>
    );
    const scroll = screen.getByTestId('screen-form');
    expect(scroll.type).toBe('RCTScrollView');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(enclosingProps(scroll, KeyboardAvoidingView)?.behavior).toBe('padding');
  });

  it('renders a plain container without scrolling', async () => {
    await renderWithProviders(
      <Screen testID="screen-plain">
        <Text>Plain</Text>
      </Screen>
    );
    const container = screen.getByTestId('screen-plain');
    expect(container.type).toBe('View');
    expect(enclosingProps(container, KeyboardAvoidingView)).toBeNull();
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

  it('shows the loading state, then the content', async () => {
    const { rerender } = await renderWithProviders(
      <QueryState query={base} testID="q">
        {(data: string) => <Text>{data}</Text>}
      </QueryState>
    );
    expect(screen.getByTestId('q-loading')).toBeOnTheScreen();
    await rerender(
      <QueryState query={{ ...base, data: 'Loaded', isPending: false }} testID="q">
        {(data: string) => <Text>{data}</Text>}
      </QueryState>
    );
    expect(screen.getByText('Loaded')).toBeOnTheScreen();
  });

  it('shows an error with retry when nothing is cached', async () => {
    const refetch = jest.fn();
    await renderWithProviders(
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
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps showing cached data when a refresh fails (offline tolerance)', async () => {
    await renderWithProviders(
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

  it('shows the empty state', async () => {
    await renderWithProviders(
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
  it('toggles a checkbox and a switch row with accessible state', async () => {
    const onCheck = jest.fn();
    const onSwitch = jest.fn();
    await renderWithProviders(
      <>
        <Checkbox label="Accept all" checked={false} onChange={onCheck} />
        <SwitchRow label="Show me on the map" value onChange={onSwitch} help="Off by default." />
      </>
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Accept all' });
    expect(checkbox).not.toBeChecked();
    await fireEvent.press(checkbox);
    expect(onCheck).toHaveBeenCalledWith(true);
    const toggle = screen.getByRole('switch', { name: 'Show me on the map' });
    expect(toggle).toBeChecked();
    await fireEvent.press(toggle);
    expect(onSwitch).toHaveBeenCalledWith(false);
  });

  it('selects a radio option', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
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
    await fireEvent.press(screen.getByRole('radio', { name: 'Public' }));
    expect(onChange).toHaveBeenCalledWith('PUBLIC');
  });

  it('reveals a password on demand and shows inline errors', async () => {
    await renderWithProviders(
      <PasswordField
        label="Password"
        value="secret"
        onChangeText={jest.fn()}
        error="Enter your password."
      />
    );
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
  });

  it('renders form messages as alerts', async () => {
    await renderWithProviders(<FormMessage testID="msg">Something failed.</FormMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent(/Something failed\./);
  });

  it('steps a value within its bounds', async () => {
    const onChange = jest.fn();
    const { rerender } = await renderWithProviders(
      <Stepper
        label="Trading radius"
        value={10}
        min={1}
        max={50}
        next={nextRadius}
        onChange={onChange}
        format={(v) => `${v} km`}
      />
    );
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('10 km');
    await fireEvent.press(screen.getByRole('button', { name: 'Increase trading radius' }));
    expect(onChange).toHaveBeenLastCalledWith(15);
    await rerender(
      <Stepper label="Trading radius" value={50} min={1} max={50} onChange={onChange} />
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Increase trading radius' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('blocks presses while a button is loading', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Button label="Save" loading loadingLabel="Saving…" onPress={onPress} />
    );
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('confirms or cancels', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderWithProviders(
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
    await fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders nothing when hidden', async () => {
    await renderWithProviders(
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

  it('shows one message, hides it after its duration or on tap', async () => {
    jest.useFakeTimers();
    try {
      await renderWithProviders(<Trigger />);
      await fireEvent.press(screen.getByText('show'));
      expect(screen.getByTestId('snackbar')).toHaveTextContent('Profile saved.');
      await act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.queryByTestId('snackbar')).toBeNull();
      await fireEvent.press(screen.getByText('show'));
      await fireEvent.press(screen.getByTestId('snackbar'));
      expect(screen.queryByTestId('snackbar')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
