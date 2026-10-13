import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import { useAccount } from '@/src/account/AccountProvider';
import { useUid } from '@/src/api/hooks/useUid';
import { DEFAULT_REGION, isRegionCode } from '@/src/lib/place';

/**
 * The platform region the app browses (ADR 0017, mirror of the web's `RegionContext`): search,
 * card holders, the map, its binder lists and sponsored placements all send it as `region`, and
 * the server stays the judge of what a region holds.
 *
 * Which region, in this order:
 * 1. the one picked with the region switcher (or opened by a link) in this session;
 * 2. the collector's home region (`homeRegion` of `GET /me`, the region of their declared place);
 * 3. the last region picked on this device (a collector without a location has no home region);
 * 4. Americas (North).
 *
 * A pick belongs to the account and the home region it was made under: signing in as someone
 * else, or saving a location in another region, brings the app back to the home region.
 *
 * Only the region code is kept on the device (one of three names, the same for everyone in it):
 * never a place, and nothing about where the device is.
 */
export const BROWSING_REGION_STORAGE_KEY = 'orenjitrade.browsing-region.v1';

interface BrowsingRegionState {
  /** The region picked in this session, with the account and home region it was picked under. */
  picked: { region: string; scope: string } | null;
  /** The last region picked on this device. */
  stored: string | null;
  /** The device storage answered, or failed: nothing more to wait for. */
  hydrated: boolean;
}

const INITIAL: BrowsingRegionState = { picked: null, stored: null, hydrated: false };

export const useBrowsingRegionStore = create<BrowsingRegionState>()(() => INITIAL);

let hydration: Promise<void> | null = null;

/**
 * Reads the last picked region from the device, once. Storage can fail or be missing (a private
 * window, a full disk): the app then browses the home region or Americas (North).
 */
export function hydrateBrowsingRegion(): Promise<void> {
  hydration ??= (async () => {
    let stored: string | null = null;
    try {
      const value = await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY);
      stored = isRegionCode(value) ? value : null;
    } catch {
      stored = null;
    }
    // A region picked while the storage was being read is newer than what it held.
    useBrowsingRegionStore.setState((state) => ({
      stored: state.stored ?? stored,
      hydrated: true,
    }));
  })();
  return hydration;
}

/** Forgets the session's pick and the hydration (tests, between two cases). */
export function resetBrowsingRegion(): void {
  hydration = null;
  useBrowsingRegionStore.setState(INITIAL);
}

/** The account and home region a pick belongs to. */
export function browsingScope(uid: string | null, home: string | null): string {
  return `${uid ?? ''}|${home ?? ''}`;
}

/** Picks a region for this session and keeps it on the device (best effort). */
export async function pickBrowsingRegion(region: string, scope: string): Promise<void> {
  if (!isRegionCode(region)) {
    return;
  }
  useBrowsingRegionStore.setState({ picked: { region, scope }, stored: region });
  try {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, region);
  } catch {
    // The pick still holds for this session.
  }
}

/** The region to browse (see the order at the top of this file). */
export function resolveBrowsingRegion(input: {
  picked: { region: string; scope: string } | null;
  scope: string;
  home: string | null;
  stored: string | null;
}): string {
  if (input.picked && input.picked.scope === input.scope) {
    return input.picked.region;
  }
  return input.home ?? input.stored ?? DEFAULT_REGION;
}

export interface BrowsingRegion {
  /** The region every region-scoped call sends. */
  region: string;
  /** The collector's own region; null without a location. */
  home: string | null;
  /** Browsing another region than one's own. */
  away: boolean;
  /**
   * True once the region is settled (`/me` answered, and the device was read when the collector
   * has no home region), so nothing is asked in one region first and again in another.
   */
  ready: boolean;
  /** Browses another region (the switcher, a link). Malformed codes are ignored. */
  select: (region: string) => void;
}

export function useBrowsingRegion(): BrowsingRegion {
  const me = useAccount().me;
  const uid = useUid();
  const home = isRegionCode(me?.homeRegion) ? me.homeRegion : null;
  const scope = browsingScope(uid, home);
  const picked = useBrowsingRegionStore((state) => state.picked);
  const stored = useBrowsingRegionStore((state) => state.stored);
  const hydrated = useBrowsingRegionStore((state) => state.hydrated);

  useEffect(() => {
    void hydrateBrowsingRegion();
  }, []);

  const region = resolveBrowsingRegion({ picked, scope, home, stored });
  const pickedHere = picked !== null && picked.scope === scope;
  const select = useCallback((next: string) => void pickBrowsingRegion(next, scope), [scope]);
  return {
    region,
    home,
    away: home !== null && region !== home,
    ready: !!me && (pickedHere || home !== null || hydrated),
    select,
  };
}
