import { create } from 'zustand';

import type { FeedFilter } from './feedRules';

/**
 * The chip of Home: kept while the app runs, back to All when it restarts (default 3 of the owner
 * prompt of 2026-10-19, section 8).
 */
export const useHomeChip = create<{ kind: FeedFilter }>()(() => ({ kind: 'ALL' }));
