import {
  deriveAccountStatus,
  needsAgeConfirmation,
  needsOnboarding,
} from '@/src/account/accountStatus';
import { gateFor } from '@/src/account/gate';
import { signalFromError } from '@/src/api/accountSignal';
import { ApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import {
  AGE_CONFIRMATION_LABEL_EN,
  AGE_CONFIRMATION_TYPE,
  ageConfirmationOf,
  ageConsentFor,
  isAgeConfirmation,
} from '@/src/features/legal/ageConfirmation';

import { AGE_CONFIRMATION, LEGAL_DOCUMENTS, meFixture } from '../support/fixtures';

const ONBOARDED = { profileComplete: true, interestsSet: true, locationSet: true };

describe('the 18+ rule (launch readiness)', () => {
  it('needs onboarding while the API reports ageConfirmed === false, never without the flag', () => {
    expect(needsOnboarding(meFixture({ onboarding: { ...ONBOARDED, ageConfirmed: false } }))).toBe(
      true
    );
    expect(
      needsAgeConfirmation(meFixture({ onboarding: { ...ONBOARDED, ageConfirmed: false } }))
    ).toBe(true);
    expect(needsOnboarding(meFixture({ onboarding: { ...ONBOARDED, ageConfirmed: true } }))).toBe(
      false
    );
    // An older API that does not report the flag never asks for it.
    expect(needsOnboarding(meFixture({ onboarding: ONBOARDED }))).toBe(false);
    expect(needsAgeConfirmation(meFixture({ onboarding: ONBOARDED }))).toBe(false);
    expect(needsAgeConfirmation(undefined)).toBe(false);
  });

  it('routes an account without the confirmation to Review our terms (stage R12), not the welcome', () => {
    const derive = (onboarding: object, requiredConsents: object[] = []) =>
      deriveAccountStatus({
        sessionStatus: 'authenticated',
        me: meFixture({
          onboarding: { ...ONBOARDED, ...onboarding },
          requiredConsents: requiredConsents as never,
        }),
        error: null,
        isPending: false,
        signal: null,
      });
    // An existing collector with no document due: Review our terms, with the age line alone.
    const ageOnly = derive({ ageConfirmed: false });
    expect(ageOnly.status).toBe('consent-required');
    expect(ageOnly.requiredConsents).toEqual([]);
    expect(gateFor(ageOnly.status, false)).toBe('consent');
    // A Google sign-up: the documents and the age on the same screen, then the welcome.
    const google = derive({ profileComplete: false, interestsSet: false, ageConfirmed: false }, [
      { documentType: 'TERMS', version: '2026-09-01' },
    ]);
    expect(google.status).toBe('consent-required');
    expect(google.requiredConsents).toEqual([{ documentType: 'TERMS', version: '2026-09-01' }]);
    // Confirmed: ready, and the welcome for an unfinished profile.
    expect(derive({ ageConfirmed: true }).status).toBe('ready');
    expect(derive({ profileComplete: false, ageConfirmed: true }).status).toBe('ready');
    expect(gateFor('ready', true)).toBe('onboarding');
    // An older API without the flag: never asked.
    expect(derive({}).status).toBe('ready');
  });

  it('names the checkbox in English only (owner, 2026-10-20)', () => {
    expect(AGE_CONFIRMATION_LABEL_EN).toBe('I confirm I am 18 years of age or older');
  });

  it('finds the published attestation and keeps it out of the readable documents', () => {
    expect(ageConfirmationOf(LEGAL_DOCUMENTS)).toEqual(AGE_CONFIRMATION);
    expect(ageConfirmationOf(undefined)).toBeNull();
    expect(ageConfirmationOf([])).toBeNull();
    expect(isAgeConfirmation(AGE_CONFIRMATION)).toBe(true);
    expect(isAgeConfirmation({ documentType: 'TERMS' })).toBe(false);
    expect(ageConsentFor(AGE_CONFIRMATION)).toEqual({
      documentType: AGE_CONFIRMATION_TYPE,
      version: '2026-10-05',
    });
  });

  it('explains 403 AGE_CONFIRMATION_REQUIRED and raises the account signal that reloads /me', () => {
    const error = ApiError.fromProblem(403, {
      status: 403,
      errorCode: 'AGE_CONFIRMATION_REQUIRED',
      message: 'Confirm that you are 18 years of age or older to continue',
      requiredConsents: [{ documentType: 'AGE_CONFIRMATION', version: '2026-10-05' }],
    });
    expect(error.isAgeConfirmationRequired).toBe(true);
    expect(friendlyError(error)).toEqual({
      title: 'Age confirmation required',
      message:
        'Please confirm that you are 18 years of age or older to be shown on the map, message or post. We will take you to the confirmation.',
    });
    expect(signalFromError(error, 7)).toEqual({ kind: 'age-confirmation-required', at: 7 });
    // The signal itself is not an account state: `/me` (reloaded) decides through its flag.
    expect(
      deriveAccountStatus({
        sessionStatus: 'authenticated',
        me: meFixture(),
        error: null,
        isPending: false,
        signal: { kind: 'age-confirmation-required', at: 7 },
      }).status
    ).toBe('ready');
  });

  it('keeps the limit wording plain (no plan, no Premium pitch in the generic message)', () => {
    const limit = ApiError.fromProblem(429, {
      status: 429,
      errorCode: 'LIMIT_REACHED',
      message: 'Limit reached',
    });
    expect(friendlyError(limit)).toEqual({
      title: 'Limit reached',
      message: 'You reached a usage limit for this action.',
    });
    expect(friendlyError(limit).message).not.toMatch(/Premium|plan/);
  });
});
