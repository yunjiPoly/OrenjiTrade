import { create } from 'zustand';

import { useScanStore } from './scanStore';
import type { ScanVisibility } from './types';

/**
 * The review's two pills, "Private"/"Public" and "No binder" (mockup screen 30): Private and in no
 * binder by default (the owner's default 3, spec section 10). They belong to the scan, not to the
 * review screen: going back to scanning and coming back to the review keeps them, and a new scan
 * starts with the defaults again (the scan's `generation`). In memory only, like the scan.
 */
interface StoredOptions {
  generation: number;
  visibility: ScanVisibility;
  binderId: string | null;
}

const useOptionsStore = create<StoredOptions>()(() => ({
  generation: -1,
  visibility: 'PRIVATE',
  binderId: null,
}));

export interface ScanReviewOptions {
  visibility: ScanVisibility;
  binderId: string | null;
  setVisibility: (visibility: ScanVisibility) => void;
  setBinderId: (binderId: string | null) => void;
}

export function useScanReviewOptions(): ScanReviewOptions {
  const generation = useScanStore((state) => state.generation);
  const stored = useOptionsStore();
  const current =
    stored.generation === generation
      ? stored
      : { generation, visibility: 'PRIVATE' as const, binderId: null };
  // A change made for an earlier scan starts from the defaults of this one.
  const change = (patch: Partial<Omit<StoredOptions, 'generation'>>) =>
    useOptionsStore.setState((state) =>
      state.generation === generation
        ? patch
        : { generation, visibility: 'PRIVATE', binderId: null, ...patch }
    );
  return {
    visibility: current.visibility,
    binderId: current.binderId,
    setVisibility: (visibility) => change({ visibility }),
    setBinderId: (binderId) => change({ binderId }),
  };
}

/** Back to the defaults (tests). */
export function resetScanReviewOptions(): void {
  useOptionsStore.setState({ generation: -1, visibility: 'PRIVATE', binderId: null });
}
