import type { GameResponse, HandleAvailabilityResponse } from '@orenji/api-client';
import { HANDLE_PATTERN } from '../../shared/profile/profile-form';

/**
 * The welcome after sign-up (spec 14: "Step n of 3"; the phone's R12 `welcomeSteps.ts`): who you
 * are, what you collect, where you ship from. The 18+ confirmation is asked at sign-up or on
 * Review our terms, never here.
 */
export type WelcomeStep = 'profile' | 'games' | 'place';

export const WELCOME_STEPS: readonly WelcomeStep[] = ['profile', 'games', 'place'];

/**
 * Where the welcome starts or resumes: the profile until it was saved once, the games until the
 * account has a game or a tag (`interestsSet`), then the place.
 */
export function firstWelcomeStep(
  onboarding: { profileComplete?: boolean; interestsSet?: boolean } | null | undefined,
): WelcomeStep {
  if (!onboarding?.profileComplete) {
    return 'profile';
  }
  return onboarding.interestsSet ? 'place' : 'games';
}

/** "Step {n} of 3": the step's number, from 1. */
export function welcomeStepNumber(step: WelcomeStep): number {
  return WELCOME_STEPS.indexOf(step) + 1;
}

/** The step before (Back), or null on the first. */
export function previousWelcomeStep(step: WelcomeStep): WelcomeStep | null {
  const index = WELCOME_STEPS.indexOf(step);
  return index > 0 ? (WELCOME_STEPS[index - 1] ?? null) : null;
}

/** A tile of "What do you collect?": a game, and whether its cards are in the catalogue yet. */
export interface WelcomeGame {
  slug: string;
  name: string;
  /** False: dimmed "Cards coming soon" (it can be picked, not browsed yet). */
  browsable: boolean;
}

/** The games the welcome offers (`GET /games`, ACTIVE ones, in the API's order). */
export function welcomeGames(games: readonly GameResponse[] | null): WelcomeGame[] {
  return (games ?? [])
    .filter((game) => !!game.slug && game.status === 'ACTIVE')
    .map((game) => ({
      slug: game.slug as string,
      name: game.shortName || game.name || (game.slug as string),
      browsable: game.hasCards === true,
    }));
}

/**
 * The game Home and Search open on after the welcome ("Opens first" on its tile): the first game
 * picked that can be browsed; none when no picked game has cards yet (Yu-Gi-Oh! then, stage G).
 */
export function openingGame(
  picked: readonly string[],
  games: readonly WelcomeGame[],
): string | null {
  return picked.find((slug) => games.some((game) => game.slug === slug && game.browsable)) ?? null;
}

/** What the handle field says while the collector types (spec 14: "@sam_trades is free"). */
export type HandleCheck = 'idle' | 'checking' | 'free' | 'yours' | 'taken';

/**
 * The live check's state: nothing for an empty or malformed handle (the format is said when
 * Continue is pressed) or while typing; "Checking…" while the API is asked; free, the collector's
 * own, or taken. A failed check (offline, 429) says nothing: the save still decides.
 */
export function handleCheckState(input: {
  /** The handle as typed. */
  typed: string;
  /** The handle the check was asked for (the typed one once typing paused). */
  settled: string;
  /** The answer, or `null` while none came (or the check failed). */
  answer: Pick<HandleAvailabilityResponse, 'handle' | 'status' | 'available'> | null;
  checking: boolean;
}): HandleCheck {
  const typed = input.typed.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(typed) || typed !== input.settled) {
    return 'idle';
  }
  if (input.answer?.handle !== typed) {
    return input.checking ? 'checking' : 'idle';
  }
  switch (input.answer.status) {
    case 'AVAILABLE':
      return 'free';
    case 'CURRENT':
      return 'yours';
    case 'TAKEN':
      return 'taken';
    default:
      return 'idle';
  }
}

/**
 * The display name the welcome offers: the account's, unless it is still the handle the API gave
 * it (a new account provisioned before the name typed at sign-up reached it), then that name.
 */
export function welcomeDisplayName(
  saved: string | null | undefined,
  handle: string | null | undefined,
  typedAtSignUp: string | null | undefined,
): string {
  const name = saved?.trim() ?? '';
  const typed = typedAtSignUp?.trim() ?? '';
  if (typed && (!name || name === handle)) {
    return typed;
  }
  return name;
}
