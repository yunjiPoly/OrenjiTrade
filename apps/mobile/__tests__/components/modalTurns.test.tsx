import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import {
  afterModals,
  mayPresent,
  modalEntersScreen,
  modalLeavesScreen,
  modalsLeaving,
  modalsOnScreen,
} from '@/src/components/ui/modalTurns';

import { renderWithProviders } from '../test-utils';

// jest-expo runs the app as iOS: the modals take turns here, as on an iPhone.

/** A menu sheet whose row closes the sheet and asks for a confirmation in the same instant. */
function MenuThenConfirm({ nested = false }: { nested?: boolean }) {
  const [menu, setMenu] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const dialog = (
    <ConfirmDialog
      visible={confirm}
      title="Block Ben?"
      message="They are not told."
      confirmLabel="Block"
      onConfirm={() => setConfirm(false)}
      onCancel={() => setConfirm(false)}
      testID="block-dialog"
    />
  );
  return (
    <>
      <BottomSheet visible={menu} onClose={() => setMenu(false)} testID="menu">
        <Button
          label="Block"
          onPress={() => {
            if (!nested) {
              setMenu(false);
            }
            setConfirm(true);
          }}
          testID="menu-block"
        />
        {nested ? dialog : null}
      </BottomSheet>
      {nested ? null : dialog}
      <Text>{confirm ? 'confirmation asked for' : 'idle'}</Text>
    </>
  );
}

/** A sheet that can be closed and asked for again while it is still sliding away. */
function ReopenedSheet() {
  const [open, setOpen] = useState(true);
  const [taps, setTaps] = useState(0);
  return (
    <>
      <Button label="Open" onPress={() => setOpen(true)} testID="reopen" />
      <BottomSheet visible={open} onClose={() => setOpen(false)} testID="sheet">
        <Button label="Close" onPress={() => setOpen(false)} testID="sheet-close" />
        <Button label="Tap" onPress={() => setTaps((count) => count + 1)} testID="sheet-tap" />
      </BottomSheet>
      <Text>{`taps ${taps}`}</Text>
    </>
  );
}

describe('one modal at a time on iOS', () => {
  it('a modal may be presented when none is on screen, when it holds the turn, or when nested', () => {
    expect(mayPresent({ nested: false, holdsTurn: false, others: 0 })).toBe(true);
    expect(mayPresent({ nested: false, holdsTurn: false, others: 1 })).toBe(false);
    expect(mayPresent({ nested: false, holdsTurn: true, others: 1 })).toBe(true);
    expect(mayPresent({ nested: true, holdsTurn: false, others: 2 })).toBe(true);
  });

  it('counts the modals on screen and forgets each one once', () => {
    const before = modalsOnScreen();
    const leave = modalEntersScreen();
    expect(modalsOnScreen()).toBe(before + 1);
    leave();
    leave();
    expect(modalsOnScreen()).toBe(before);
  });

  it('what iOS presents itself (the photo picker) waits for the last modal to leave', async () => {
    await expect(afterModals()).resolves.toBeUndefined();

    const first = modalEntersScreen();
    const second = modalEntersScreen();
    let free = false;
    const waiting = afterModals().then(() => {
      free = true;
    });
    first();
    await Promise.resolve();
    expect(free).toBe(false);
    second();
    await waiting;
    expect(free).toBe(true);
    expect(modalsOnScreen()).toBe(0);
  });

  it('what iOS presents itself waits until iOS has dismissed a sheet that slid away', async () => {
    // The share sheet asked for while iOS was still dismissing the "⋯" sheet never appeared
    // (stage R6, review fix 1): the sheet counts until its Modal reports `onDismiss`.
    const { mockDismissals } = require('react-native/Libraries/Modal/Modal') as {
      mockDismissals: { count: number };
    };
    const before = mockDismissals.count;
    const seen: number[] = [];
    function ShareFromSheet() {
      const [open, setOpen] = useState(true);
      return (
        <BottomSheet visible={open} onClose={() => setOpen(false)} testID="menu">
          <Button
            label="Share"
            onPress={() => {
              setOpen(false);
              void afterModals().then(() => seen.push(mockDismissals.count));
            }}
            testID="menu-share"
          />
        </BottomSheet>
      );
    }
    renderWithProviders(<ShareFromSheet />);
    fireEvent.press(screen.getByTestId('menu-share'));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toBe(before + 1);
    expect(modalsOnScreen()).toBe(0);
    expect(modalsLeaving()).toBe(0);
  });

  it('counts a modal iOS is still taking away, once, for what iOS presents itself', async () => {
    const leave = modalLeavesScreen();
    expect(modalsLeaving()).toBe(1);
    let free = false;
    const waiting = afterModals().then(() => {
      free = true;
    });
    await Promise.resolve();
    expect(free).toBe(false);
    leave();
    leave();
    await waiting;
    expect(free).toBe(true);
    expect(modalsLeaving()).toBe(0);
  });

  it('a dialog asked for by a sheet row waits until the sheet has left, then appears', async () => {
    renderWithProviders(<MenuThenConfirm />);
    expect(screen.getByTestId('menu')).toBeOnTheScreen();
    expect(modalsOnScreen()).toBe(1);

    // While something else holds the screen, the confirmation is asked for but not presented:
    // iOS would refuse it for good.
    const hold = modalEntersScreen();
    fireEvent.press(screen.getByTestId('menu-block'));
    expect(screen.getByText('confirmation asked for')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('menu')).toBeNull());
    expect(screen.queryByTestId('block-dialog')).toBeNull();

    // The screen is free: the confirmation appears, nobody had to tap again.
    act(() => hold());
    expect(await screen.findByTestId('block-dialog')).toBeOnTheScreen();
    expect(screen.getByText('Block Ben?')).toBeOnTheScreen();
    expect(modalsOnScreen()).toBe(1);
  });

  it('the sheet counts as on screen while it slides away', async () => {
    renderWithProviders(<MenuThenConfirm />);
    fireEvent.press(screen.getByTestId('menu-block'));
    // Right after the tap the sheet is still mounted (closing): the dialog is not presented yet.
    if (screen.queryByTestId('menu')) {
      expect(screen.queryByTestId('block-dialog')).toBeNull();
    }
    expect(await screen.findByTestId('block-dialog')).toBeOnTheScreen();
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('a sheet asked for again while it slides away comes back at once, as the same sheet', async () => {
    renderWithProviders(<ReopenedSheet />);
    const tap = screen.getByTestId('sheet-tap');
    fireEvent.press(screen.getByTestId('sheet-close'));
    fireEvent.press(screen.getByTestId('reopen'));
    // Longer than the close animation: a sheet that waited for itself would have been taken down
    // and put up again by now, and what was found in it before would be gone.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(screen.getByTestId('sheet')).toBeOnTheScreen();
    fireEvent.press(tap);
    expect(screen.getByText('taps 1')).toBeOnTheScreen();
    expect(modalsOnScreen()).toBe(1);

    fireEvent.press(screen.getByTestId('sheet-close'));
    await waitFor(() => expect(screen.queryByTestId('sheet')).toBeNull());
    expect(modalsOnScreen()).toBe(0);
  });

  it('a dialog rendered inside an open sheet is presented at once (its parent presents it)', () => {
    renderWithProviders(<MenuThenConfirm nested />);
    fireEvent.press(screen.getByTestId('menu-block'));
    expect(screen.getByTestId('block-dialog')).toBeOnTheScreen();
    expect(screen.getByTestId('menu')).toBeOnTheScreen();
  });

  it('leaves no modal counted once everything is closed', async () => {
    const view = renderWithProviders(<MenuThenConfirm />);
    fireEvent.press(screen.getByTestId('menu-block'));
    fireEvent.press(await screen.findByTestId('block-dialog-confirm'));
    await waitFor(() => expect(screen.queryByTestId('block-dialog')).toBeNull());
    expect(modalsOnScreen()).toBe(0);
    view.unmount();
    expect(modalsOnScreen()).toBe(0);
  });
});
