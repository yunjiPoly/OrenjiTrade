import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';

import { useAccount } from '@/src/account/AccountProvider';
import { useRegions } from '@/src/api/hooks/regions';
import { useUid } from '@/src/api/hooks/useUid';
import { BUILT_IN_REGIONS, DEFAULT_REGION, isRegionCode } from '@/src/lib/place';

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
 * Only a region that exists is ever browsed (`useKnownRegions`): the three regions the app ships
 * until `GET /regions` was read, then whatever that list holds. A code from a link or from the
 * device that the server does not list is not followed, and is forgotten once the list says so.
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

/**
 * Picks a region for this session and keeps it on the device (best effort). The caller checks
 * that the region exists (`select` of `useBrowsingRegion` does).
 */
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

/**
 * Forgets a region the server does not list (call it with the codes of `GET /regions` only): the
 * session's pick is dropped and the code is removed from the device, so the next launch does not
 * start there either.
 */
export async function forgetUnknownRegions(known: ReadonlySet<string>): Promise<void> {
  const { picked, stored } = useBrowsingRegionStore.getState();
  const dropPicked = picked !== null && !known.has(picked.region);
  const dropStored = stored !== null && !known.has(stored);
  if (!dropPicked && !dropStored) {
    return;
  }
  useBrowsingRegionStore.setState({
    picked: dropPicked ? null : picked,
    stored: dropStored ? null : stored,
  });
  if (dropStored) {
    try {
      await AsyncStorage.removeItem(BROWSING_REGION_STORAGE_KEY);
    } catch {
      // Nothing more to do: the code is no longer used in this session.
    }
  }
}

/**
 * The region to browse (see the order at the top of this file). A pick or a stored code is only
 * followed when it is one of the `known` regions (the three the app ships, by default); the home
 * region comes from the server and is always followed.
 */
export function resolveBrowsingRegion(input: {
  picked: { region: string; scope: string } | null;
  scope: string;
  home: string | null;
  stored: string | null;
  known?: ReadonlySet<string>;
}): string {
  const known = input.known ?? BUILT_IN_REGIONS;
  const exists = (region: string) => region === input.home || known.has(region);
  if (input.picked && input.picked.scope === input.scope && exists(input.picked.region)) {
    return input.picked.region;
  }
  if (input.home) {
    return input.home;
  }
  return input.stored && exists(input.stored) ? input.stored : DEFAULT_REGION;
}

export interface KnownRegions {
  /** The codes of the regions that exist, as far as the app can tell. */
  codes: ReadonlySet<string>;
  /** True once the codes are those of `GET /regions`: the server has spoken. */
  fromServer: boolean;
}

const SHIPPED: KnownRegions = { codes: BUILT_IN_REGIONS, fromServer: false };

/**
 * The regions that exist: the list of `GET /regions` once it was read in this session (the server
 * is the judge), the three regions the app ships until then. Asks nothing itself.
 */
export function useKnownRegions(): KnownRegions {
  const loaded = useRegions(false).data?.regions;
  return useMemo(
    () =>
      loaded && loaded.length > 0
        ? { codes: new Set(loaded.map((region) => region.code)), fromServer: true }
        : SHIPPED,
    [loaded]
  );
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
  /**
   * Browses another region (the switcher, a link). A code that is malformed, or that names no
   * region the app knows, is ignored: nothing is asked for it and nothing is kept on the device.
   */
  select: (region: string) => void;
  /** True for the home region and for every region that exists (see `useKnownRegions`). */
  knows: (region: string) => boolean;
}

export function useBrowsingRegion(): BrowsingRegion {
  const me = useAccount().me;
  const uid = useUid();
  const home = isRegionCode(me?.homeRegion) ? me.homeRegion : null;
  const scope = browsingScope(uid, home);
  const picked = useBrowsingRegionStore((state) => state.picked);
  const stored = useBrowsingRegionStore((state) => state.stored);
  const hydrated = useBrowsingRegionStore((state) => state.hydrated);

  const known = useKnownRegions();

  useEffect(() => {
    void hydrateBrowsingRegion();
  }, []);

  // The server's list is the judge once it is known: a pick or a stored code it does not hold is
  // dropped from the session and from the device (a link, an old install, a region taken down).
  useEffect(() => {
    if (known.fromServer) {
      void forgetUnknownRegions(known.codes);
    }
  }, [known, picked, stored]);

  const region = resolveBrowsingRegion({ picked, scope, home, stored, known: known.codes });
  const knows = useCallback(
    (candidate: string) => candidate === home || known.codes.has(candidate),
    [home, known]
  );
  const pickedHere = picked !== null && picked.scope === scope && knows(picked.region);
  const select = useCallback(
    (next: string) => {
      if (knows(next)) {
        void pickBrowsingRegion(next, scope);
      }
    },
    [knows, scope]
  );
  return {
    region,
    home,
    away: home !== null && region !== home,
    ready: !!me && (pickedHere || home !== null || hydrated),
    select,
    knows,
  };
}
