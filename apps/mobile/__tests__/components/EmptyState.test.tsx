import { fireEvent, screen } from '@testing-library/react-native';

import { EmptyState } from '@/src/components/ui/EmptyState';

import { renderWithProviders } from '../test-utils';

describe('EmptyState', () => {
  it('renders title and description', () => {
    renderWithProviders(
      <EmptyState
        title="Your inventory is empty"
        description="Add cards to a binder to get started."
      />
    );
    expect(screen.getByText('Your inventory is empty')).toBeOnTheScreen();
    expect(screen.getByText('Add cards to a binder to get started.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders an action button that calls onAction', () => {
    const onAction = jest.fn();
    renderWithProviders(
      <EmptyState title="Nothing here" actionLabel="Add a card" onAction={onAction} />
    );
    fireEvent.press(screen.getByRole('button', { name: 'Add a card' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders in dark mode without a light-mode background', () => {
    renderWithProviders(<EmptyState title="Dark" testID="dark-empty" />, { scheme: 'dark' });
    expect(screen.getByTestId('dark-empty')).toBeOnTheScreen();
  });
});
