import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { FormDialog } from '@/src/components/ui/FormDialog';
import { SCRIM_FLOOR, darkPalette, lightPalette, scrimColor, tokens } from '@/src/theme';

import { renderWithProviders } from '../test-utils';

// iOS takes a full-window view with a translucent pure black background for the dimming view of
// a modal and hides what is behind it from VoiceOver; the native view keeps that mark when React
// Native reuses it (src/theme/scrim.ts). Nothing here can ask iOS: the native flow
// .maestro/dialog-after-sheet.yaml does. These tests hold the colour itself.

/** `rgba(r, g, b, a)` as numbers. */
function channels(colour: string) {
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(colour);
  if (!match) {
    throw new Error(`not an rgba() colour: ${colour}`);
  }
  const [red, green, blue, alpha] = match.slice(1).map(Number) as [number, number, number, number];
  return { red, green, blue, alpha };
}

/** The white level iOS compares with (measured: under about 0.02 is black to it). */
function whiteLevel(colour: string): number {
  const { red, green, blue } = channels(colour);
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

describe('the colour of a scrim', () => {
  it('keeps the opacity and is never darker than the floor', () => {
    expect(scrimColor('rgba(0, 0, 0, 0.6)')).toBe('rgba(12, 10, 9, 0.6)');
    expect(scrimColor('rgba(0,0,0,0.92)')).toBe('rgba(12, 10, 9, 0.92)');
    expect(scrimColor('rgb(0, 0, 0)')).toBe('rgba(12, 10, 9, 1)');
    expect(scrimColor('#000')).toBe('rgba(12, 10, 9, 1)');
    expect(scrimColor('#00000099')).toBe('rgba(12, 10, 9, 0.6)');
    // One channel at a time: a red that is nearly black is still black to iOS.
    expect(scrimColor('rgba(16, 0, 0, 0.5)')).toBe('rgba(16, 10, 9, 0.5)');
  });

  it('leaves a colour that is light enough as it is', () => {
    expect(scrimColor('rgba(28, 25, 23, 0.48)')).toBe('rgba(28, 25, 23, 0.48)');
    expect(scrimColor('#1C1917')).toBe('rgba(28, 25, 23, 1)');
  });

  it('refuses a colour it cannot read, so a new token format is noticed at once', () => {
    expect(() => scrimColor('black')).toThrow('A scrim is made from');
    expect(() => scrimColor('hsl(0, 0%, 0%)')).toThrow('A scrim is made from');
  });

  it('the floor itself is well above what iOS takes for black', () => {
    const floor = `rgba(${SCRIM_FLOOR.red}, ${SCRIM_FLOOR.green}, ${SCRIM_FLOOR.blue}, 1)`;
    expect(whiteLevel(floor)).toBeGreaterThan(0.035);
  });

  it.each([
    ['light', lightPalette, tokens.color.light.overlay],
    ['dark', darkPalette, tokens.color.dark.overlay],
  ] as const)(
    'the %s palette has a scrim with the opacity of its overlay token',
    (_, palette, overlay) => {
      expect(whiteLevel(palette.scrim)).toBeGreaterThan(0.035);
      expect(channels(palette.scrim).alpha).toBe(channels(scrimColor(overlay)).alpha);
      expect(palette.scrim).toBe(scrimColor(overlay));
    }
  );

  it('the light scrim is the overlay token unchanged, the dark one is not the black token', () => {
    expect(lightPalette.scrim).toBe(tokens.color.light.overlay.replace(/\s+/g, ' '));
    expect(tokens.color.dark.overlay).toBe('rgba(0, 0, 0, 0.6)');
    expect(darkPalette.scrim).toBe('rgba(12, 10, 9, 0.6)');
  });
});

// The testing library leaves the siblings of an `aria-modal` view out (the dialogs mark their
// panel so): the backdrop is asked for with the hidden elements.
const HIDDEN = { includeHiddenElements: true };

describe('what dims the page behind a sheet or a dialog', () => {
  it.each(['light', 'dark'] as const)('a sheet takes the scrim of the %s palette', (scheme) => {
    const palette = scheme === 'dark' ? darkPalette : lightPalette;
    renderWithProviders(
      <BottomSheet visible onClose={jest.fn()} testID="menu">
        <Text>Rows</Text>
      </BottomSheet>,
      { scheme }
    );
    expect(screen.getByTestId('menu-backdrop')).toHaveStyle({ backgroundColor: palette.scrim });
  });

  it.each(['light', 'dark'] as const)(
    'a confirmation takes the scrim of the %s palette',
    (scheme) => {
      const palette = scheme === 'dark' ? darkPalette : lightPalette;
      renderWithProviders(
        <ConfirmDialog
          visible
          title="Delete the card?"
          message="This cannot be undone."
          confirmLabel="Delete"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          testID="delete-dialog"
        />,
        { scheme }
      );
      expect(screen.getByTestId('delete-dialog-backdrop', HIDDEN)).toHaveStyle({
        backgroundColor: palette.scrim,
      });
    }
  );

  it.each(['light', 'dark'] as const)(
    'a form dialog takes the scrim of the %s palette',
    (scheme) => {
      const palette = scheme === 'dark' ? darkPalette : lightPalette;
      renderWithProviders(
        <FormDialog
          visible
          title="Condition"
          confirmLabel="Save"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          testID="row-dialog"
        >
          <Text>Fields</Text>
        </FormDialog>,
        { scheme }
      );
      expect(screen.getByTestId('row-dialog-backdrop', HIDDEN)).toHaveStyle({
        backgroundColor: palette.scrim,
      });
    }
  );

  it('in the dark theme no backdrop is the translucent black iOS takes for a modal', () => {
    renderWithProviders(
      <ConfirmDialog
        visible
        title="Delete the card?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        testID="delete-dialog"
      />,
      { scheme: 'dark' }
    );
    expect(screen.getByTestId('delete-dialog-backdrop', HIDDEN)).not.toHaveStyle({
      backgroundColor: tokens.color.dark.overlay,
    });
  });
});
