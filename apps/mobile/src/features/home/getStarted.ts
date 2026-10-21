import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { MyLocationResponse } from '@/src/api/types';

/**
 * Get started (owner prompt of 2026-10-19, section 3; mockup v50 screen 10c): three steps a new
 * collector does once, under Home's search field, until all three are done or the collector hides
 * them. Both are remembered for good per account on this phone (AsyncStorage keyed by the user
 * id; not across phones, default 2 of the prompt's section 8).
 */

/** Step 1, "Choose your province". */
export type ProvinceStep =
  /** A state or province, and "Show me on the map" on: "{province}, {country}". */
  | { state: 'done'; place: string }
  /** No location yet: "Choose". */
  | { state: 'todo' }
  /** A location, but hidden from the map: "Turn on". */
  | { state: 'hidden' };

export interface GetStartedSteps {
  province: ProvinceStep;
  /** Step 2, "List your first card": one of the collector's cards is set to Public. */
  card: boolean;
  /** Step 3, "Add a card you want": the wishlist holds a wish. */
  wish: boolean;
  /** How many of the three are done. */
  done: number;
}

export interface GetStartedInput {
  location: MyLocationResponse | undefined;
  /** How many of the collector's cards are set to Public (`markedPublic`), if known. */
  publicCards: number | undefined;
  /** How many wishes the collector has, if known. */
  wishes: number | undefined;
}

/** The steps, or null while one of the three answers is not known yet. */
export function getStartedSteps(input: GetStartedInput): GetStartedSteps | null {
  if (!input.location || input.publicCards === undefined || input.wishes === undefined) {
    return null;
  }
  const where = input.location.location;
  const province: ProvinceStep = !where?.subdivisionCode
    ? { state: 'todo' }
    : input.location.discoverable
      ? { state: 'done', place: where.label || `${where.subdivisionName}, ${where.countryName}` }
      : { state: 'hidden' };
  const card = input.publicCards > 0;
  const wish = input.wishes > 0;
  const done = (province.state === 'done' ? 1 : 0) + (card ? 1 : 0) + (wish ? 1 : 0);
  return { province, card, wish, done };
}

/** All three done: the card goes away for good. */
export function isComplete(steps: GetStartedSteps): boolean {
  return steps.done === 3;
}

// ---------------------------------------------------------------------------------------------
// Hidden for good, per account on this phone
// ---------------------------------------------------------------------------------------------

export const GET_STARTED_STORAGE_PREFIX = 'orenjitrade.home.get-started-hidden.v1.';

interface HiddenState {
  /** Per account uid: hidden for good, shown, or not read yet (absent). */
  hidden: Readonly<Record<string, boolean>>;
}

export const useGetStartedStore = create<HiddenState>()(() => ({ hidden: {} }));

const reads = new Map<string, Promise<void>>();

function storageKey(uid: string): string {
  return `${GET_STARTED_STORAGE_PREFIX}${uid}`;
}

/** Reads whether this account hid Get started on this phone, once per account. */
export function hydrateGetStarted(uid: string): Promise<void> {
  let read = reads.get(uid);
  if (!read) {
    read = (async () => {
      let hidden = false;
      try {
        hidden = (await AsyncStorage.getItem(storageKey(uid))) === 'hidden';
      } catch {
        // Storage can fail (a full disk, a private window on the web): Get started shows.
        hidden = false;
      }
      useGetStartedStore.setState((state) =>
        uid in state.hidden ? state : { hidden: { ...state.hidden, [uid]: hidden } }
      );
    })();
    reads.set(uid, read);
  }
  return read;
}

/** Hides Get started for good for this account on this phone (closed, or all three done). */
export async function hideGetStarted(uid: string): Promise<void> {
  useGetStartedStore.setState((state) => ({ hidden: { ...state.hidden, [uid]: true } }));
  try {
    await AsyncStorage.setItem(storageKey(uid), 'hidden');
  } catch {
    // Kept for this session at least.
  }
}

/** Forgets every read (tests, between two cases). */
export function resetGetStarted(): void {
  reads.clear();
  useGetStartedStore.setState({ hidden: {} });
}
