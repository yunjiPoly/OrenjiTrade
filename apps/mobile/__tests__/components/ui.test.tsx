import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';

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

import { renderWithProviders } from '../test-utils';

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
      fireEvent.press(screen.getByTestId('snackbar'));
      expect(screen.queryByTestId('snackbar')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
