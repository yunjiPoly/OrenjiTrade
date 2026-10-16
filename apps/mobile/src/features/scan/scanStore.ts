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
  /** Applies a pure change of `scanSession.ts` (nothing happens when it returns the same session). */
  apply: (change: (session: ScanSession) => ScanSession) => void;
  /** An empty scan, the next generation. */
  reset: () => void;
}

export const useScanStore = create<ScanStore>()((set) => ({
  session: emptyScanSession(),
  generation: 0,
  apply: (change) =>
    set((state) => {
      const session = change(state.session);
      return session === state.session ? state : { session };
    }),
  reset: () => set((state) => ({ session: emptyScanSession(), generation: state.generation + 1 })),
}));
