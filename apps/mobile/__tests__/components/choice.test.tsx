import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Segmented } from '@/src/components/ui/Segmented';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { ThemeProvider } from '@/src/theme/ThemeProvider';

function themed(ui: React.ReactElement) {
  return render(<ThemeProvider scheme="light">{ui}</ThemeProvider>);
}

describe('choice controls', () => {
  it('ChoiceChips is a radio group with one checked chip', () => {
    const onChange = jest.fn();
    themed(
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
    fireEvent.press(screen.getByTestId('condition-LP'));
    expect(onChange).toHaveBeenCalledWith('LP');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a condition.');
  });

  it('ChoiceChips brings the chosen chip of a scrolling row on screen when the choice changes elsewhere', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const options = [
      { value: 'ALL', label: 'All (435)' },
      { value: 'CHOOSE', label: 'Needs a printing (0)' },
      { value: 'ASSUMED', label: 'Plain copy assumed (115)' },
      { value: 'UNMATCHED', label: 'Not recognised (15)' },
    ];
    const chips = (value: string, revealSelected = true) => (
      <ThemeProvider scheme="light">
        <ChoiceChips
          label="Lines shown"
          hideLabel
          scroll
          revealSelected={revealSelected}
          options={options}
          value={value}
          onChange={jest.fn()}
          testID="filter"
        />
      </ThemeProvider>
    );
    /** A phone 370 points wide: the third chip is cut at the edge, the fourth is off screen. */
    const layOut = () => {
      fireEvent(screen.getByTestId('filter-row'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 370, height: 40 } },
      });
      [
        ['ALL', 0, 90],
        ['CHOOSE', 98, 160],
        ['ASSUMED', 266, 200],
        ['UNMATCHED', 474, 160],
      ].forEach(([key, x, width]) =>
        fireEvent(screen.getByTestId(`filter-${key}`), 'layout', {
          nativeEvent: { layout: { x, y: 0, width, height: 36 } },
        })
      );
    };
    const view = render(chips('ALL'));
    layOut();
    // The chosen chip is on screen: the row stays where it is.
    expect(scrollTo).not.toHaveBeenCalled();

    // A button elsewhere chooses the chip that is cut at the edge: the row brings it in whole.
    view.rerender(chips('ASSUMED'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 266 + 200 - 370 + 8, animated: true });
    fireEvent.scroll(screen.getByTestId('filter-row'), {
      nativeEvent: { contentOffset: { x: 104, y: 0 } },
    });

    // Back to the first chip, now off screen on the left.
    view.rerender(chips('ALL'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
    fireEvent.scroll(screen.getByTestId('filter-row'), {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });

    // A chip that is whole on screen moves nothing.
    scrollTo.mockClear();
    view.rerender(chips('CHOOSE'));
    expect(scrollTo).not.toHaveBeenCalled();

    // Without the option a scrolling row never moves by itself (the game pills).
    view.unmount();
    const plain = render(chips('ALL', false));
    plain.rerender(chips('UNMATCHED', false));
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('SelectSheet opens its options and reports a new choice', () => {
    const onChange = jest.fn();
    themed(
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
    fireEvent.press(screen.getByRole('button', { name: 'Sort: Recently updated' }));
    expect(screen.getByText('Alphabetical')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('sort-option-updated'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('sort'));
    fireEvent.press(screen.getByTestId('sort-option-name'));
    expect(onChange).toHaveBeenCalledWith('name');
  });

  it('SelectSheet cuts a compact pill to one line, unless it must show its whole choice', () => {
    const options = [{ value: 'europe', label: 'Europe' }];
    const cut = themed(
      <SelectSheet compact label="Region" options={options} value="europe" onChange={jest.fn()} />
    );
    expect(screen.getByText('Region: Europe').props.numberOfLines).toBe(1);
    cut.unmount();
    // The region switcher: at the largest text size the name wraps instead of ending in "…".
    themed(
      <SelectSheet
        compact
        wrap
        label="Region"
        options={options}
        value="europe"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByText('Region: Europe').props.numberOfLines).toBeUndefined();
    // Corners of half a line's height: a pill on one line, a rounded box on several (not an
    // oval around three lines of large text).
    expect(screen.getByRole('button', { name: 'Region: Europe' })).toHaveStyle({
      borderRadius: 18,
      maxWidth: '100%',
    });
  });

  it('Segmented switches views', () => {
    const onChange = jest.fn();
    themed(
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
    fireEvent.press(screen.getByTestId('view-binders'));
    expect(onChange).toHaveBeenCalledWith('binders');
  });

  it('Segmented keeps each label on one line at any text size, and offers it enlarged', () => {
    themed(
      <Segmented
        label="Search"
        options={[
          { value: 'cards', label: 'Cards' },
          { value: 'collectors', label: 'Collectors' },
          { value: 'binders', label: 'Binders' },
        ]}
        value="cards"
        onChange={jest.fn()}
        testID="segment"
      />
    );
    // At the largest accessibility sizes "Collectors" broke over five lines in its third of the
    // width and the control took a third of the screen: a label follows the text size a little
    // and never wraps. It is never shrunk to fit either: on iOS that drew every label four
    // points high at the default size.
    const label = screen.getByText('Collectors');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.maxFontSizeMultiplier).toBe(1.2);
    expect(label.props.adjustsFontSizeToFit).toBeUndefined();
    // A long press shows it enlarged (iOS large content viewer).
    const tab = screen.getByRole('tab', { name: 'Collectors' });
    expect(tab.props.accessibilityShowsLargeContentViewer).toBe(true);
    expect(tab.props.accessibilityLargeContentTitle).toBe('Collectors');
    // Two segments have half the width each: their labels follow the text size a little more.
    themed(
      <Segmented
        label="Map or list"
        options={[
          { value: 'map', label: 'Map' },
          { value: 'list', label: 'List' },
        ]}
        value="map"
        onChange={jest.fn()}
        testID="two"
      />
    );
    expect(screen.getByText('List').props.maxFontSizeMultiplier).toBe(1.35);
    expect(screen.getByText('List').props.numberOfLines).toBe(1);
  });

  it('ListFooter shows loading and retry', () => {
    const onRetry = jest.fn();
    const { rerender } = themed(<ListFooter loading failed={false} onRetry={onRetry} />);
    expect(screen.getByLabelText('Loading more')).toBeOnTheScreen();
    rerender(
      <ThemeProvider scheme="light">
        <ListFooter loading={false} failed onRetry={onRetry} />
      </ThemeProvider>
    );
    fireEvent.press(screen.getByTestId('list-footer-retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});
