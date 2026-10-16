import { create } from 'zustand';

import type { LocalPhoto } from '@/src/features/inventory/inventoryUiStore';

interface BinderUiState {
  /** Photos of a new binder that could not be uploaded, by binder id: Edit binder offers "Try again". */
  failedPhotos: Readonly<Record<string, readonly LocalPhoto[]>>;
  keepFailedPhotos: (binderId: string, photos: readonly LocalPhoto[]) => void;
  /** The failed photos of a binder, removed from the store (Edit binder takes them over). */
  takeFailedPhotos: (binderId: string) => readonly LocalPhoto[];
}

/**
 * What New binder hands to Edit binder while the app runs (never persisted: a picked photo lives
 * in the app's memory and cache only until it is uploaded), as the card screens of stage R2 do.
 */
export const useBinderUiStore = create<BinderUiState>()((set, get) => ({
  failedPhotos: {},
  keepFailedPhotos: (binderId, photos) =>
    set((state) => ({ failedPhotos: { ...state.failedPhotos, [binderId]: [...photos] } })),
  takeFailedPhotos: (binderId) => {
    const photos = get().failedPhotos[binderId] ?? [];
    if (photos.length > 0) {
      set((state) => {
        const next = { ...state.failedPhotos };
        delete next[binderId];
        return { failedPhotos: next };
      });
    }
    return photos;
  },
}));
