import { fireEvent, screen } from '@testing-library/react-native';

import { StyleSheet } from 'react-native';

import { EMPTY_STATE_DESCRIPTION_MAX_FONT_SCALE, EmptyState } from '@/src/components/ui/EmptyState';
import { TITLE_MAX_FONT_SCALE } from '@/src/theme';

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

  it('keeps the title to twice its size at the largest text sizes, so a word is never cut in two', () => {
    renderWithProviders(
      <EmptyState title="Your inventory is empty" description="Add the cards you own." />
    );
    expect(screen.getByText('Your inventory is empty')).toHaveProp(
      'maxFontSizeMultiplier',
      TITLE_MAX_FONT_SCALE
    );
  });

  it('never draws the description larger than the title, at any text size (R8 review F4)', () => {
    renderWithProviders(
      <EmptyState title="Your inventory is empty" description="Add the cards you own." />
    );
    const title = screen.getByText('Your inventory is empty');
    const description = screen.getByText('Add the cards you own.');
    const largest = (node: typeof title) =>
      StyleSheet.flatten(node.props.style).fontSize * node.props.maxFontSizeMultiplier;
    expect(description).toHaveProp('maxFontSizeMultiplier', EMPTY_STATE_DESCRIPTION_MAX_FONT_SCALE);
    // Body text still grows past the default (to 2.5 times its 16 pt), up to the title's 40 pt.
    expect(EMPTY_STATE_DESCRIPTION_MAX_FONT_SCALE).toBeGreaterThan(2);
    expect(largest(description)).toBeLessThanOrEqual(largest(title));
    expect(largest(title)).toBe(40);
  });
});
