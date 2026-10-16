import { create } from 'zustand';

/** The two saved details (see savedDetails.ts). */
export type SavedDetailKind = 'address' | 'etransfer';

interface SavedDetailsState {
  uid: string | null;
  loaded: boolean;
  address: string | null;
  etransfer: string | null;
  setAll: (uid: string | null, address: string | null, etransfer: string | null) => void;
  setOne: (kind: SavedDetailKind, value: string | null) => void;
}

/**
 * What was read of the signed-in account's saved details (savedDetails.ts reads and writes the
 * phone's secure storage). A module of its own so that the session can forget it at sign-out
 * without depending on the hooks.
 */
export const useSavedDetailsStore = create<SavedDetailsState>((set) => ({
  uid: null,
  loaded: false,
  address: null,
  etransfer: null,
  setAll: (uid, address, etransfer) => set({ uid, loaded: true, address, etransfer }),
  setOne: (kind, value) => set(kind === 'address' ? { address: value } : { etransfer: value }),
}));

/**
 * Forgets what was read, keeping what the phone's secure storage holds (sign-out, or another
 * account signs in): nothing of one account stays in memory for the next, and the details are
 * there again at that account's next sign-in (review fix 1, P3).
 */
export function unloadSavedDetails(): void {
  useSavedDetailsStore.setState({ uid: null, loaded: false, address: null, etransfer: null });
}
