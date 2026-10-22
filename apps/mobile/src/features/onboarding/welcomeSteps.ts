import type { OnboardingStatus } from '@/src/api/types';
import type { GameOption } from '@/src/features/games/browsingGame';
import { HANDLE_PATTERN } from '@/src/lib/profile';

/**
 * The welcome after sign-up (stage R12, mockup v50 screens 40 to 42): three steps, the age asked
 * at sign-up or on Review our terms instead (the welcome never asks it).
 */
export type WelcomeStep = 'profile' | 'games' | 'place';

export const WELCOME_STEPS: readonly WelcomeStep[] = ['profile', 'games', 'place'];

/**
 * Where the welcome starts or resumes: the profile until it is saved once, then the games until
 * the account has a game or a tag (`interestsSet`, the API's own flag, unchanged for the paused
 * web), then the place. Without the flags (an older `/me`), the first step.
 */
export function firstWelcomeStep(
  onboarding: Pick<OnboardingStatus, 'profileComplete' | 'interestsSet'> | null | undefined
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

/**
 * The game Home and Search open on after the welcome ("Opens first" on its tile): the first game
 * picked that can be browsed (it has cards). A game whose cards are coming soon can be picked but
 * not browsed, so the next picked one opens first; none when no picked game has cards yet (Home
 * then opens on Yu-Gi-Oh!, stage G). Without the games list, the first picked.
 */
export function openingGame(
  picked: readonly string[],
  options: readonly GameOption[] | null
): string | null {
  if (options === null) {
    return picked[0] ?? null;
  }
  return (
    picked.find((slug) => options.some((option) => option.slug === slug && option.browsable)) ??
    null
  );
}

/** What the handle field shows beside the handle while the collector types. */
export type HandleCheck = 'idle' | 'checking' | 'available' | 'taken';

/**
 * The live check's state (screen 40): nothing for an empty or malformed handle (the format is said
 * when Continue is pressed) or while typing; a spinner while the API is asked; a teal check when
 * the handle saves (free, or the collector's own); "taken" when another account holds it or it is
 * reserved. A failed check (offline, 429) shows nothing: the save still decides.
 */
export function handleCheckState(input: {
  /** The handle as typed. */
  typed: string;
  /** The handle the check was asked for (the typed one once typing paused). */
  settled: string;
  fetching: boolean;
  answer: { handle: string; status: string; available: boolean } | undefined;
}): HandleCheck {
  const typed = input.typed.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(typed) || typed !== input.settled) {
    return 'idle';
  }
  if (input.fetching && input.answer?.handle !== typed) {
    return 'checking';
  }
  if (!input.answer || input.answer.handle !== typed) {
    return 'idle';
  }
  if (input.answer.available) {
    return 'available';
  }
  return input.answer.status === 'TAKEN' ? 'taken' : 'idle';
}
