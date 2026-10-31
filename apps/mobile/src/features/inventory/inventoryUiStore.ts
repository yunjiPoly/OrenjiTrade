import { create } from 'zustand';

import type { PickedImage } from '@/src/api/imageFormData';

/** A photo picked on the phone and not on the server yet (adding a card, Edit card). */
export interface LocalPhoto extends PickedImage {
  /** Stable key of the tile (the picker's URIs can repeat). */
  key: string;
  /** Bytes, when the picker told them (checked against the 8 MB rule before the upload). */
  size?: number | null;
  /**
   * Why the API refused it, once an upload was refused for the photo itself (too large in pixels,
   * unreadable, wrong type): "Try again" cannot work, the collector removes it.
   */
  problem?: string | null;
}

interface InventoryUiState {
  /** The card saved last: its row stands out in Inventory (the orange ring of screen 8). */
  lastSavedId: string | null;
  /** Photos of a card that could not be uploaded, by item id: Edit card offers "Try again". */
  failedPhotos: Readonly<Record<string, readonly LocalPhoto[]>>;
  markSaved: (id: string | null) => void;
  keepFailedPhotos: (itemId: string, photos: readonly LocalPhoto[]) => void;
  /** The failed photos of a card, removed from the store (Edit card takes them over). */
  takeFailedPhotos: (itemId: string) => readonly LocalPhoto[];
}

/**
 * State the inventory screens hand to each other while the app runs (never persisted: a picked
 * photo lives in the app's memory and cache only, and nothing of it leaves the phone until it is
 * uploaded).
 */
export const useInventoryUiStore = create<InventoryUiState>()((set, get) => ({
  lastSavedId: null,
  failedPhotos: {},
  markSaved: (id) => set({ lastSavedId: id }),
  keepFailedPhotos: (itemId, photos) =>
    set((state) => ({ failedPhotos: { ...state.failedPhotos, [itemId]: [...photos] } })),
  takeFailedPhotos: (itemId) => {
    const photos = get().failedPhotos[itemId] ?? [];
    if (photos.length > 0) {
      set((state) => {
        const next = { ...state.failedPhotos };
        delete next[itemId];
        return { failedPhotos: next };
      });
    }
    return photos;
  },
}));

let photoKey = 0;

/** A key no other local photo of this run has. */
export function nextPhotoKey(): string {
  photoKey += 1;
  return `local-${photoKey}`;
}
