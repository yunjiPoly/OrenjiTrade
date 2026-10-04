import {
  consentsFor,
  hasErrors,
  register,
  requiredAtRegistration,
  validateEmail,
  validateSignUp,
} from '@/src/account/registration';
import { ApiError } from '@/src/api/ApiError';

import { LEGAL_DOCUMENTS } from '../support/fixtures';

const REQUIRED = requiredAtRegistration(LEGAL_DOCUMENTS);

describe('sign-up rules', () => {
  it('validates the email', () => {
    expect(validateEmail('')).toBe('Enter your email address.');
    expect(validateEmail('maika@')).toBe('That email address does not look right.');
    expect(validateEmail(' maika@example.test ')).toBeNull();
  });

  it('validates every field and requires each registration document', () => {
    const empty = validateSignUp(
      { displayName: '', email: '', password: '', acceptedDocumentTypes: [] },
      REQUIRED
    );
    expect(empty).toEqual({
      displayName: 'Enter a display name.',
      email: 'Enter your email address.',
      password: 'Choose a password.',
      consents: 'Please accept every document to continue.',
    });
    expect(hasErrors(empty)).toBe(true);

    const short = validateSignUp(
      {
        displayName: 'x'.repeat(81),
        email: 'a@b.co',
        password: 'short',
        acceptedDocumentTypes: ['TERMS'],
      },
      REQUIRED
    );
    expect(short.displayName).toBe('Use at most 80 characters.');
    expect(short.password).toBe('Use at least 8 characters.');
    expect(short.consents).toBe('Please accept every document to continue.');

    const valid = validateSignUp(
      {
        displayName: 'Maïka',
        email: 'maika@example.test',
        password: 'long-enough',
        acceptedDocumentTypes: ['TERMS', 'PRIVACY'],
      },
      REQUIRED
    );
    expect(hasErrors(valid)).toBe(false);
  });

  it('refuses to register while the legal documents are unavailable', () => {
    expect(
      validateSignUp(
        { displayName: 'M', email: 'm@e.co', password: 'long-enough', acceptedDocumentTypes: [] },
        []
      ).consents
    ).toBe('The legal documents could not be loaded.');
  });

  it('lists only documents required at registration, terms first', () => {
    expect(REQUIRED.map((document) => document.documentType)).toEqual(['TERMS', 'PRIVACY']);
    expect(consentsFor(REQUIRED)).toEqual([
      { documentType: 'TERMS', version: '2026-09-01' },
      { documentType: 'PRIVACY', version: '2026-09-01' },
    ]);
  });
});

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
  const form = { displayName: ' Maïka ', email: ' maika@example.test ', password: 'long-enough' };

  it('creates the Firebase account, records the consents, then sends the verification email', async () => {
    const d = deps();
    await expect(register(form, REQUIRED, d)).resolves.toEqual({ verificationEmailSent: true });
    expect(d.signUp).toHaveBeenCalledWith('maika@example.test', 'long-enough', 'Maïka');
    expect(d.acceptConsents).toHaveBeenCalledWith(consentsFor(REQUIRED));
    expect(d.onStep.mock.calls.map(([step]) => step)).toEqual([
      'account',
      'consents',
      'verification',
    ]);
  });

  it('reuses the account created by a failed attempt', async () => {
    const d = deps('MAIKA@example.test');
    await register(form, REQUIRED, d);
    expect(d.signUp).not.toHaveBeenCalled();
    expect(d.acceptConsents).toHaveBeenCalled();
  });

  it('rejects with the API error when the consents fail', async () => {
    const d = deps();
    const failure = ApiError.network(new TypeError('offline'));
    d.acceptConsents.mockRejectedValueOnce(failure);
    await expect(register(form, REQUIRED, d)).rejects.toBe(failure);
    expect(d.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('treats the verification email as best effort', async () => {
    const d = deps();
    d.sendEmailVerification.mockRejectedValueOnce(new Error('quota'));
    await expect(register(form, REQUIRED, d)).resolves.toEqual({ verificationEmailSent: false });
  });
});
