import {
  AGE_CONFIRMATION_REQUIRED_MESSAGE,
  consentsFor,
  hasErrors,
  register,
  requiredAtRegistration,
  validateEmail,
  validateSignUp,
} from '@/src/account/registration';
import { ApiError } from '@/src/api/ApiError';
import { ageConfirmationOf } from '@/src/features/legal/ageConfirmation';

import { AGE_CONFIRMATION, LEGAL_DOCUMENTS } from '../support/fixtures';

const REQUIRED = requiredAtRegistration(LEGAL_DOCUMENTS);
const AGE = ageConfirmationOf(LEGAL_DOCUMENTS);

describe('sign-up rules', () => {
  it('validates the email', () => {
    expect(validateEmail('')).toBe('Enter your email address.');
    expect(validateEmail('maika@')).toBe('That email address does not look right.');
    expect(validateEmail(' maika@example.test ')).toBeNull();
  });

  it('validates every field, requires each registration document and the 18+ confirmation', () => {
    const empty = validateSignUp(
      { displayName: '', email: '', password: '', acceptedDocumentTypes: [], ageConfirmed: false },
      REQUIRED,
      AGE
    );
    expect(empty).toEqual({
      displayName: 'Enter a display name.',
      email: 'Enter your email address.',
      password: 'Choose a password.',
      consents: 'Please accept every document to continue.',
      age: AGE_CONFIRMATION_REQUIRED_MESSAGE,
    });
    expect(hasErrors(empty)).toBe(true);

    const short = validateSignUp(
      {
        displayName: 'x'.repeat(81),
        email: 'a@b.co',
        password: 'short',
        acceptedDocumentTypes: ['TERMS'],
        ageConfirmed: true,
      },
      REQUIRED,
      AGE
    );
    expect(short.displayName).toBe('Use at most 80 characters.');
    expect(short.password).toBe('Use at least 8 characters.');
    expect(short.consents).toBe('Please accept every document to continue.');
    expect(short.age).toBeNull();

    // Every document accepted is not enough: the attestation is its own statement.
    const unconfirmed = validateSignUp(
      {
        displayName: 'Maïka',
        email: 'maika@example.test',
        password: 'long-enough',
        acceptedDocumentTypes: ['TERMS', 'PRIVACY'],
        ageConfirmed: false,
      },
      REQUIRED,
      AGE
    );
    expect(unconfirmed.consents).toBeNull();
    expect(unconfirmed.age).toBe(AGE_CONFIRMATION_REQUIRED_MESSAGE);
    expect(hasErrors(unconfirmed)).toBe(true);

    const valid = validateSignUp({ ...unconfirmed, ...form(), ageConfirmed: true }, REQUIRED, AGE);
    expect(hasErrors(valid)).toBe(false);
  });

  it('never asks for the confirmation an older API does not publish', () => {
    expect(validateSignUp({ ...form(), ageConfirmed: false }, REQUIRED, null).age).toBeNull();
  });

  it('refuses to register while the legal documents are unavailable', () => {
    expect(
      validateSignUp(
        {
          displayName: 'M',
          email: 'm@e.co',
          password: 'long-enough',
          acceptedDocumentTypes: [],
          ageConfirmed: true,
        },
        []
      ).consents
    ).toBe('The legal documents could not be loaded.');
  });

  it('lists only documents required at registration, terms first, never the attestation', () => {
    expect(REQUIRED.map((document) => document.documentType)).toEqual(['TERMS', 'PRIVACY']);
    expect(AGE).toEqual(AGE_CONFIRMATION);
    expect(consentsFor(REQUIRED)).toEqual([
      { documentType: 'TERMS', version: '2026-09-01' },
      { documentType: 'PRIVACY', version: '2026-09-01' },
    ]);
    // The attestation is recorded after the documents, with the published version.
    expect(consentsFor(REQUIRED, AGE)).toEqual([
      { documentType: 'TERMS', version: '2026-09-01' },
      { documentType: 'PRIVACY', version: '2026-09-01' },
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05' },
    ]);
  });
});

function form() {
  return {
    displayName: 'Maïka',
    email: 'maika@example.test',
    password: 'long-enough',
    acceptedDocumentTypes: ['TERMS', 'PRIVACY'],
  };
}

describe('register', () => {
  function deps(currentEmail: string | null = null) {
    return {
      signUp: jest.fn(async () => undefined),
      currentEmail: jest.fn(() => currentEmail),
      acceptConsents: jest.fn(async () => undefined),
      sendEmailVerification: jest.fn(async () => undefined),
      onStep: jest.fn(),
    };
  }
  const input = { displayName: ' Maïka ', email: ' maika@example.test ', password: 'long-enough' };

  it('creates the Firebase account, records the consents and the 18+ confirmation, then sends the verification email', async () => {
    const d = deps();
    await expect(register(input, REQUIRED, d, AGE)).resolves.toEqual({
      verificationEmailSent: true,
    });
    expect(d.signUp).toHaveBeenCalledWith('maika@example.test', 'long-enough', 'Maïka');
    expect(d.acceptConsents).toHaveBeenCalledWith(consentsFor(REQUIRED, AGE));
    expect(d.onStep.mock.calls.map(([step]) => step)).toEqual([
      'account',
      'consents',
      'verification',
    ]);
  });

  it('records only the documents when the API does not publish the attestation', async () => {
    const d = deps();
    await register(input, REQUIRED, d);
    expect(d.acceptConsents).toHaveBeenCalledWith(consentsFor(REQUIRED));
  });

  it('reuses the account created by a failed attempt', async () => {
    const d = deps('MAIKA@example.test');
    await register(input, REQUIRED, d, AGE);
    expect(d.signUp).not.toHaveBeenCalled();
    expect(d.acceptConsents).toHaveBeenCalled();
  });

  it('rejects with the API error when the consents fail', async () => {
    const d = deps();
    const failure = ApiError.network(new TypeError('offline'));
    d.acceptConsents.mockRejectedValueOnce(failure);
    await expect(register(input, REQUIRED, d, AGE)).rejects.toBe(failure);
    expect(d.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('treats the verification email as best effort', async () => {
    const d = deps();
    d.sendEmailVerification.mockRejectedValueOnce(new Error('quota'));
    await expect(register(input, REQUIRED, d, AGE)).resolves.toEqual({
      verificationEmailSent: false,
    });
  });
});
