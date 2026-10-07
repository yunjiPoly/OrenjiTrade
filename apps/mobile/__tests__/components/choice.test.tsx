import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Segmented } from '@/src/components/ui/Segmented';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { ThemeProvider } from '@/src/theme/ThemeProvider';

function themed(ui: React.ReactElement) {
  return render(<ThemeProvider scheme="light">{ui}</ThemeProvider>);
}

describe('choice controls', () => {
  it('ChoiceChips is a radio group with one checked chip', async () => {
    const onChange = jest.fn();
    await themed(
      <ChoiceChips
        label="Condition"
        options={[
          { value: 'NM', label: 'Near Mint' },
          { value: 'LP', label: 'Lightly Played' },
        ]}
        value="NM"
        onChange={onChange}
        error="Choose a condition."
        testID="condition"
      />
    );
    expect(screen.getByTestId('condition').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Near Mint' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Lightly Played' })).not.toBeChecked();
    await fireEvent.press(screen.getByTestId('condition-LP'));
    expect(onChange).toHaveBeenCalledWith('LP');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a condition.');
  });

  it('SelectSheet opens its options and reports a new choice', async () => {
    const onChange = jest.fn();
    await themed(
      <SelectSheet
        label="Sort"
        options={[
          { value: 'updated', label: 'Recently updated' },
          { value: 'name', label: 'Name (A–Z)', detail: 'Alphabetical' },
        ]}
        value="updated"
        onChange={onChange}
        testID="sort"
      />
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Recently updated' }));
    expect(screen.getByText('Alphabetical')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sort-option-updated'));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('sort'));
    await fireEvent.press(screen.getByTestId('sort-option-name'));
    expect(onChange).toHaveBeenCalledWith('name');
  });

  it('Segmented switches views', async () => {
    const onChange = jest.fn();
    await themed(
      <Segmented
        label="View"
        options={[
          { value: 'cards', label: 'Cards' },
          { value: 'binders', label: 'Binders' },
        ]}
        value="cards"
        onChange={onChange}
        testID="view"
      />
    );
    expect(screen.getByRole('tab', { name: 'Cards' })).toBeSelected();
    await fireEvent.press(screen.getByTestId('view-binders'));
    expect(onChange).toHaveBeenCalledWith('binders');
  });

  it('ListFooter shows loading and retry', async () => {
    const onRetry = jest.fn();
    const { rerender } = await themed(<ListFooter loading failed={false} onRetry={onRetry} />);
    expect(screen.getByLabelText('Loading more')).toBeOnTheScreen();
    await rerender(
      <ThemeProvider scheme="light">
        <ListFooter loading={false} failed onRetry={onRetry} />
      </ThemeProvider>
    );
    await fireEvent.press(screen.getByTestId('list-footer-retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});
