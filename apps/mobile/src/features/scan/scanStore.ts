import { create } from 'zustand';

import { emptyScanSession, type ScanSession } from './scanSession';

/**
 * The scan the collector is making, shared by its screens (the camera and its tray, the review,
 * the search inside the scan): one scan at a time, in memory only. Closing the app loses a scan
 * that was not added (the owner's default 1, spec section 10). Every change goes through the pure
 * functions of `scanSession.ts`.
 */
export interface ScanStore {
  session: ScanSession;
  /**
   * Counts the scans ended in this run of the app: an answer of the reader or the matcher that
   * comes back for an ended scan is dropped (`scanRunner.ts`).
   */
  generation: number;
  /**
   * The tiles whose match is being tried again right now: tiles waiting for the connection, and
   * cards given up after server errors ("Couldn't match") whose "Try again" was tapped. They stay
   * as they are (a try changes nothing until its answer lands): the tray, the review and the sheets
   * only show that a try is under way ("Trying again…").
   */
  trying: readonly string[];
  /**
   * A tap of "Add {n} cards to inventory" is on its way (its adds sent, their answers awaited). It
   * belongs to the scan, not to the review screen: a review opened again meanwhile (back to
   * scanning, then Review) says "Adding…" too, not that the add went unanswered.
   */
  adding: boolean;
  /** Applies a pure change of `scanSession.ts` (nothing happens when it returns the same session). */
  apply: (change: (session: ScanSession) => ScanSession) => void;
  /** Marks a tile as being tried again (or no longer). */
  setTrying: (tileId: string, trying: boolean) => void;
  /** Marks a tap of "Add {n} cards to inventory" as on its way (or no longer). */
  setAdding: (adding: boolean) => void;
  /** An empty scan, the next generation. */
  reset: () => void;
}

export const useScanStore = create<ScanStore>()((set) => ({
  session: emptyScanSession(),
  generation: 0,
  trying: [],
  adding: false,
  apply: (change) =>
    set((state) => {
      const session = change(state.session);
      return session === state.session ? state : { session };
    }),
  setTrying: (tileId, trying) =>
    set((state) => {
      const has = state.trying.includes(tileId);
      if (has === trying) {
        return state;
      }
      return {
        trying: trying
          ? [...state.trying, tileId]
          : state.trying.filter((other) => other !== tileId),
      };
    }),
  setAdding: (adding) => set((state) => (state.adding === adding ? state : { adding })),
  reset: () =>
    set((state) => ({
      session: emptyScanSession(),
      generation: state.generation + 1,
      trying: [],
      adding: false,
    })),
}));
