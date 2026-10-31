import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

/**
 * One modal at a time on iOS.
 *
 * iOS presents a modal from the screen underneath it, and a screen presents one thing at a time:
 * a second modal asked for while the first is still there is refused, without an error, and never
 * appears. The app asks for exactly that whenever a sheet row opens a dialog: "Block" in the
 * conversation menu closes the menu and opens the confirmation in the same instant, while the
 * menu is still sliding away. On an iPhone the confirmation never came up and the tap seemed to
 * do nothing; the same goes for a sheet that opens another sheet.
 *
 * So on iOS the modals of the app take turns: a sheet or dialog that is asked for while another
 * one is on screen waits until that one has left, then appears. A modal rendered inside another
 * modal (a picker inside a dialog) is presented by its parent and does not wait. Nor does a sheet
 * asked for again while it is itself still sliding away: it comes back (`BottomSheet`).
 *
 * Android stacks its dialogs as windows and the web draws them in the page: both show a modal as
 * soon as it is asked for, exactly as before (`useModalTurn` answers `visible` there).
 */

type Listener = () => void;

let onScreen = 0;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How many modals of the app are on screen right now (a sheet that is sliding away included). */
export function modalsOnScreen(): number {
  return onScreen;
}

/** Records a modal as on screen until the returned function is called (once). */
export function modalEntersScreen(): () => void {
  onScreen += 1;
  emit();
  let left = false;
  return () => {
    if (!left) {
      left = true;
      onScreen -= 1;
      emit();
    }
  };
}

let leaving = 0;

/** How many modals iOS is still taking away (hidden by the app, not yet dismissed by iOS). */
export function modalsLeaving(): number {
  return leaving;
}

/**
 * Records a modal the app has hidden and iOS is still dismissing, until the returned function is
 * called (once): from the moment a sheet has slid away until its `Modal` reports `onDismiss`.
 */
export function modalLeavesScreen(): () => void {
  leaving += 1;
  emit();
  let gone = false;
  return () => {
    if (!gone) {
      gone = true;
      leaving -= 1;
      emit();
    }
  };
}

/**
 * Resolves once no modal of the app is on screen and iOS has dismissed the last one: at once on
 * Android and the web, where nothing is counted. For what iOS itself presents, such as the photo
 * picker or the share sheet: asked for from a sheet row while the sheet slides away, iOS puts it
 * on top of the sheet and takes it away with the sheet. A sheet that has slid away is not enough:
 * iOS is still dismissing its view controller for a moment, and the share sheet asked for in that
 * moment never appeared (stage R6, review fix 1: "Share profile" in a profile's "⋯" sheet).
 */
export function afterModals(): Promise<void> {
  if (onScreen === 0 && leaving === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const stop = subscribe(() => {
      if (onScreen === 0 && leaving === 0) {
        stop();
        resolve();
      }
    });
  });
}

const InsideModalContext = createContext(false);

/** Wraps the content of a modal: a modal rendered inside is presented by this one. */
export function InsideModal({ children }: { children: ReactNode }) {
  return <InsideModalContext.Provider value>{children}</InsideModalContext.Provider>;
}

/** Whether a modal that wants to show may be presented now: pure, for the tests. */
export function mayPresent(options: { nested: boolean; holdsTurn: boolean; others: number }) {
  return options.nested || options.holdsTurn || options.others === 0;
}

function useIosModalTurn(visible: boolean): boolean {
  const nested = useContext(InsideModalContext);
  const others = useSyncExternalStore(subscribe, modalsOnScreen, modalsOnScreen);
  // Once presented, a modal keeps its turn until it is hidden (it then counts itself in `others`).
  const [holdsTurn, setHoldsTurn] = useState(false);
  const present = visible && mayPresent({ nested, holdsTurn, others });
  if (holdsTurn !== present) {
    setHoldsTurn(present);
  }
  return present;
}

function useIosModalOnScreen(mounted: boolean): void {
  useEffect(() => (mounted ? modalEntersScreen() : undefined), [mounted]);
}

const IS_IOS = Platform.OS === 'ios';

/**
 * Whether a modal asked for with `visible` is to be shown now. iOS: once no other modal of the
 * app is on screen. Android and web: as soon as it is asked for.
 */
export const useModalTurn: (visible: boolean) => boolean = IS_IOS
  ? useIosModalTurn
  : (visible) => visible;

/**
 * Tells the other modals that this one is on screen. `mounted` covers its whole time on screen: a
 * sheet stays mounted while it slides away, and that is when the next modal has to wait.
 */
export const useModalOnScreen: (mounted: boolean) => void = IS_IOS
  ? useIosModalOnScreen
  : () => undefined;
