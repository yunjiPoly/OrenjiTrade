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

  it('says that a card the collector shows stays as it is: the copies become a private card', () => {
    renderRow(rowFixture({ shownQuantity: 1 }));
    expect(screen.getByTestId('import-row-0-owned')).toHaveTextContent(
      'You show 1 publicly: that card stays as it is, and these 2 copies are added as a private card.'
    );
  });

  it('says on the line that its copy was taken as the plain one, for the collector to check', () => {
    renderRow(rowFixture({ printingChoice: 'MOST_RECENT_ASSUMED' }));
    expect(screen.getByTestId('import-row-0-assumed')).toHaveTextContent(
      'Taken as the plain copy (Unlimited, no foil): its most recent set has other versions. Change it if yours is another.'
    );
    expect(screen.getByTestId('import-row-0-printing').props.accessibilityLabel).toBe(
      'Which copy of Fixture Lantern Wisp: YDKF-EN001 · Rare · YDK Fixtures (taken as the plain copy: check it)'
    );
  });

  it('says nothing of the kind about a copy the date decided, or the collector chose', () => {
    renderRow(rowFixture({ printingChoice: 'MOST_RECENT' }));
    expect(screen.queryByTestId('import-row-0-assumed')).toBeNull();
  });

  it('says nothing of the kind once the assumed copy left the catalog: the line is to choose again', () => {
    renderRow(chooseRow({ printingChoice: 'MOST_RECENT_ASSUMED' }));
    expect(screen.queryByTestId('import-row-1-assumed')).toBeNull();
    expect(screen.getByTestId('import-row-1-printing').props.accessibilityLabel).toBe(
      'Which copy of Fixture Clockwork Heron: Choose printing'
    );
  });

  it('shows what the file said under a recognised line', () => {
    // Two lines of one card in a deck: the card, and its alternate artwork (another passcode).
    renderRow(rowFixture());
    expect(screen.getByTestId('import-row-0-source')).toHaveTextContent('Passcode 910000001');
  });

  it('shows the set, number and rarity of a CSV line as the file wrote them', () => {
    renderRow(
      rowFixture({
        deck: undefined,
        source: {
          passcode: null,
          name: 'Fixture Lantern Wisp',
          set: 'YDK Fixtures',
          number: 'EN001',
          rarity: 'Rare',
        },
      })
    );
    expect(screen.getByTestId('import-row-0-source')).toHaveTextContent(
      'In your file: YDK Fixtures · EN001 · Rare'
    );
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
      'Not recognised: Passcode 919999999, 1 copy, Side 1, No card of the catalog has this passcode (the number printed in the lower left corner of a card)., If you know which card it is, find the card by its name with “Add card” in your inventory.'
    );
    // On screen: the section of the deck that holds it, why, and what can be done next.
    expect(screen.getByText('Side 1')).toBeOnTheScreen();
    expect(screen.getByTestId('import-row-3-next')).toHaveTextContent(
      'If you know which card it is, find the card by its name with “Add card” in your inventory.'
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('a line of a game OrenjiTrade does not have says that its copies were no number', () => {
    // The API reports such a line for its game, with the copies its file wrote: 0 when that was
    // no number of copies. The line showed nothing where its copies stand.
    renderRow(
      unmatchedRow({
        unmatchedReason: 'UNKNOWN_GAME',
        deck: undefined,
        source: {
          passcode: null,
          name: 'Star Dragoon',
          set: 'Other Game Set',
          number: '017',
          rarity: null,
        },
        fileQuantity: 0,
      })
    );
    const row = screen.getByTestId('import-row-3');
    expect(
      screen.getByText('Other Game Set · 017 · copies: not a number from 1 to 9,999')
    ).toBeOnTheScreen();
    expect(screen.getByText('OrenjiTrade does not have this game.')).toBeOnTheScreen();
    expect(row.props.accessibilityLabel).toBe(
      'Not recognised: Star Dragoon, Other Game Set · 017 · copies: not a number from 1 to 9,999, OrenjiTrade does not have this game., Cards of this game cannot be added yet.'
    );
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
  function renderHeader(overrides = {}, planRoom: string | null = null) {
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
        leaveOut={false}
        busy={false}
        lowestGrades={['DAMAGED']}
        planRoom={planRoom}
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
    // The two counts that ask something of the collector are buttons that show their lines.
    fireEvent.press(screen.getByRole('button', { name: '1 not recognised' }));
    expect(handlers.onFilter).toHaveBeenCalledWith('UNMATCHED');
    fireEvent.press(screen.getByRole('button', { name: '2 need a printing' }));
    expect(handlers.onFilter).toHaveBeenCalledWith('CHOOSE_PRINTING');
    expect(screen.queryByRole('button', { name: '1 new card' })).toBeNull();
  });

  it('counts a deck in copies and different cards, never in “lines”', () => {
    renderHeader();
    expect(screen.getByTestId('import-summary-sentence')).toHaveTextContent(
      'Your file lists 4 different cards. 1 is ready to add: 2 copies.'
    );
    expect(screen.getByText('3 copies in your file')).toBeOnTheScreen();
    expect(screen.getByText('2 cards need a printing')).toBeOnTheScreen();
  });

  it('says what the cards without a condition are set to once the collector set one', () => {
    renderHeader();
    const before = screen.getByTestId('import-default-conditions');
    expect(within(before).getByText(/starts at the lowest grade \(Damaged\)/)).toBeOnTheScreen();
    expect(
      within(before).getByRole('button', { name: 'Set one condition for these 3 cards' })
    ).toBeOnTheScreen();
  });

  it('no longer says “lowest grade” after “Set one condition”', () => {
    renderHeader({ summary: summaryOf({ defaultCondition: 'NEAR_MINT' }) });
    const after = screen.getByTestId('import-default-conditions');
    expect(within(after).getByText(/You set them to Near Mint\./)).toBeOnTheScreen();
    expect(within(after).queryByText(/lowest grade/)).toBeNull();
    expect(
      within(after).getByRole('button', { name: 'Change the condition of these 3 cards' })
    ).toBeOnTheScreen();
  });

  it('counts the lines whose copy was assumed for as long as there are any, and shows them', () => {
    const handlers = renderHeader({
      source: 'COLLECTR_CSV',
      sections: null,
      summary: summaryOf({ rows: 435, toChoose: 0, assumedPrintings: 115 }),
    });
    const card = screen.getByTestId('import-assumed');
    expect(
      within(card).getByRole('header', { name: 'Plain copy assumed for 115 lines' })
    ).toBeOnTheScreen();
    expect(
      within(card).getByText(/the plain copy \(Unlimited, no foil\) was taken\. Check each one/)
    ).toBeOnTheScreen();
    fireEvent.press(within(card).getByRole('button', { name: 'Show these 115 lines' }));
    expect(handlers.onFilter).toHaveBeenCalledWith('MOST_RECENT_ASSUMED');
  });

  it('shows no such card when no copy was assumed, or every one was checked', () => {
    renderHeader();
    expect(screen.queryByTestId('import-assumed')).toBeNull();
  });

  it('says on top when the plan has no room for the import', () => {
    const room =
      'Your plan has room for 1 more card and this import adds 2 new cards: leave 1 out.';
    renderHeader({}, room);
    expect(within(screen.getByTestId('import-plan-room')).getByText(room)).toBeOnTheScreen();
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
    expect(screen.queryByTestId('import-plan-room')).toBeNull();
    // A count of zero is no button: there is nothing to show.
    expect(screen.queryByRole('button', { name: '0 need a printing' })).toBeNull();
  });
});
