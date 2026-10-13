import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { ImportPreviewHeader } from '@/src/features/inventory/import/ImportPreviewHeader';
import { ImportRowCard } from '@/src/features/inventory/import/ImportRowCard';

import {
  chooseRow,
  importFixture,
  rowFixture,
  summaryOf,
  unmatchedRow,
} from '../support/importFixtures';
import { renderWithProviders } from '../test-utils';

const WINDOW = Dimensions.get('window');

function textSize(fontScale: number) {
  act(() => {
    Dimensions.set({ window: { ...WINDOW, fontScale }, screen: { ...WINDOW, fontScale } });
  });
}

afterEach(() => textSize(1));

function renderRow(row = rowFixture(), disabled = false) {
  const handlers = { onChoosePrinting: jest.fn(), onEdit: jest.fn(), onToggle: jest.fn() };
  renderWithProviders(<ImportRowCard row={row} disabled={disabled} {...handlers} />);
  return handlers;
}

describe('a line of an import preview', () => {
  it('has three controls, each named with its card, and reports what was pressed', () => {
    const row = rowFixture();
    const handlers = renderRow(row);
    const include = screen.getByRole('checkbox', { name: 'Import Fixture Lantern Wisp' });
    expect(include).toBeChecked();
    expect(include.props.accessibilityHint).toBe('Leaves this card out');
    fireEvent.press(include);
    expect(handlers.onToggle).toHaveBeenCalledWith(row);
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Which copy of Fixture Lantern Wisp: YDKF-EN001 · Rare · YDK Fixtures',
      })
    );
    expect(handlers.onChoosePrinting).toHaveBeenCalledWith(row);
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Condition and copies of Fixture Lantern Wisp: Damaged (not in your file), 2 copies',
      })
    );
    expect(handlers.onEdit).toHaveBeenCalledWith(row);
    // The picture is the API's own (decorative here: the name is written next to it).
    expect(screen.getByTestId('card-image-img').props.source[0].uri).toMatch(
      /\/api\/v1\/public\/card-images\/wisp$/
    );
  });

  it('shows “Choose printing” where a printing is still needed', () => {
    renderRow(chooseRow());
    const printing = screen.getByTestId('import-row-1-printing');
    expect(printing.props.accessibilityLabel).toBe(
      'Which copy of Fixture Clockwork Heron: Choose printing'
    );
    expect(within(printing).getByText('Choose printing')).toBeOnTheScreen();
    expect(screen.getByText('Main 1 · Side 1')).toBeOnTheScreen();
  });

  it('says when a line does not go in, and how many copies are already owned', () => {
    renderRow(rowFixture({ included: false, willImport: false, ownedQuantity: 2 }));
    expect(screen.getByTestId('import-row-0-state')).toHaveTextContent('Left out');
    const include = screen.getByRole('checkbox', { name: 'Import Fixture Lantern Wisp' });
    expect(include).not.toBeChecked();
    expect(include.props.accessibilityHint).toBe('Puts this card back');
    expect(screen.getByTestId('import-row-0-owned')).toHaveTextContent('You have 2: this adds 2.');
  });

  it('cannot be edited while the import is committed', () => {
    renderRow(rowFixture(), true);
    expect(screen.getByTestId('import-row-0-include')).toBeDisabled();
    expect(screen.getByTestId('import-row-0-printing')).toBeDisabled();
    expect(screen.getByTestId('import-row-0-edit')).toBeDisabled();
  });

  it('a line nothing fits is one sentence and has no control', () => {
    renderRow(unmatchedRow());
    const row = screen.getByTestId('import-row-3');
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe(
      'Not recognised: Passcode 919999999, 1 copy, No card of the catalog has this passcode.'
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('puts its name and controls under the picture, across the width, at large text sizes', () => {
    renderRow();
    expect(screen.queryByTestId('import-row-0-below')).toBeNull();
    textSize(3.1);
    const below = screen.getByTestId('import-row-0-below');
    expect(within(below).getByTestId('import-row-0-name')).toHaveTextContent(
      'Fixture Lantern Wisp'
    );
    expect(within(below).getByTestId('import-row-0-printing')).toBeOnTheScreen();
    expect(within(below).getByTestId('import-row-0-edit')).toBeOnTheScreen();
    // Still one of each control.
    expect(screen.getAllByTestId('import-row-0-printing')).toHaveLength(1);
  });
});

describe('the top of an import preview', () => {
  function renderHeader(overrides = {}) {
    const handlers = {
      onFilter: jest.fn(),
      onSections: jest.fn(),
      onMostRecent: jest.fn(),
      onCondition: jest.fn(),
      onLeaveOut: jest.fn(),
    };
    renderWithProviders(
      <ImportPreviewHeader
        preview={importFixture(overrides)}
        filter="ALL"
        leaveOut={false}
        busy={false}
        {...handlers}
      />
    );
    return handlers;
  }

  it('says each count as one phrase, and offers the bulk actions that apply', () => {
    const handlers = renderHeader();
    expect(screen.getByTestId('import-summary-new').props.accessibilityLabel).toBe('1 new card');
    expect(screen.getByTestId('import-summary-choose').props.accessibilityLabel).toBe(
      '2 need a printing'
    );
    fireEvent.press(screen.getByTestId('import-bulk-recent'));
    expect(handlers.onMostRecent).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('import-bulk-condition'));
    expect(handlers.onCondition).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('import-leave-out'));
    expect(handlers.onLeaveOut).toHaveBeenCalledWith(true);
    fireEvent.press(screen.getByRole('switch', { name: 'Side deck' }));
    expect(handlers.onSections).toHaveBeenCalledWith({ includeSide: false });
    fireEvent.press(screen.getByRole('radio', { name: 'Not recognised (1)' }));
    expect(handlers.onFilter).toHaveBeenCalledWith('UNMATCHED');
  });

  it('hides what does not apply: nothing to choose, every condition known, a CSV', () => {
    renderHeader({
      source: 'COLLECTR_CSV',
      sections: null,
      summary: summaryOf({ toChoose: 0, defaultConditions: 0 }),
    });
    expect(screen.queryByTestId('import-unchosen')).toBeNull();
    expect(screen.queryByTestId('import-default-conditions')).toBeNull();
    expect(screen.queryByTestId('import-sections')).toBeNull();
    expect(screen.getByTestId('import-filter')).toBeOnTheScreen();
  });
});
