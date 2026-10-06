import { create } from 'zustand';

import type { OfferTarget } from './offerTarget';

/**
 * The cards "Make an offer" was pressed on, by item id, for the offer screen (`/offers/new?item=`):
 * no endpoint reads one public item, so the entry point (a binder, a profile, the map, a wishlist
 * match) hands over what it already shows. Not persisted: a reloaded web page or a cold start
 * explains that the offer has to be started again from the card.
 */
export interface OfferTargetStore {
  targets: Record<string, OfferTarget>;
  put: (target: OfferTarget) => void;
  clear: () => void;
}

export const useOfferTargets = create<OfferTargetStore>()((set) => ({
  targets: {},
  put: (target) => set((state) => ({ targets: { ...state.targets, [target.itemId]: target } })),
  clear: () => set({ targets: {} }),
}));

export function offerTargetFor(itemId: string | null | undefined): OfferTarget | null {
  return itemId ? (useOfferTargets.getState().targets[itemId] ?? null) : null;
}
