import type { ConsentRequest, LegalDocument } from '@/src/api/types';
import { ageConsentFor, isAgeConfirmation } from '@/src/features/legal/ageConfirmation';

/**
 * Sign-up form rules and orchestration (mirror of the web's `/auth/sign-up`, plus the display
 * name the mobile form asks for up front): Firebase account → acceptance of every legal document
 * required at registration (`POST /me/consents`, which also provisions the account) →
 * verification email. Plain functions so they are tested without rendering the screen.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;
export const DISPLAY_NAME_MAX = 80;

export interface SignUpForm {
  displayName: string;
  email: string;
  password: string;
  /** `documentType`s the user ticked. */
  acceptedDocumentTypes: readonly string[];
  /** The 18+ checkbox (never ticked by default, never part of "Accept all"). */
  ageConfirmed: boolean;
}

export interface SignUpErrors {
  displayName: string | null;
  email: string | null;
  password: string | null;
  consents: string | null;
  /** Set while the attestation is published and not ticked (older API: never asked). */
  age: string | null;
}

export const AGE_CONFIRMATION_REQUIRED_MESSAGE =
  'You must confirm that you are 18 years of age or older to use OrenjiTrade.';

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) {
    return 'Enter your email address.';
  }
  return EMAIL_PATTERN.test(value) ? null : 'That email address does not look right.';
}

export function validateSignUp(
  form: SignUpForm,
  requiredDocuments: readonly LegalDocument[],
  ageConfirmation: LegalDocument | null = null
): SignUpErrors {
  const name = form.displayName.trim();
  const missing = requiredDocuments.filter(
    (document) => !form.acceptedDocumentTypes.includes(document.documentType)
  );
  return {
    displayName: !name
      ? 'Enter a display name.'
      : name.length > DISPLAY_NAME_MAX
        ? `Use at most ${DISPLAY_NAME_MAX} characters.`
        : null,
    email: validateEmail(form.email),
    password: !form.password
      ? 'Choose a password.'
      : form.password.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
        : null,
    consents:
      requiredDocuments.length === 0
        ? 'The legal documents could not be loaded.'
        : missing.length > 0
          ? 'Please accept every document to continue.'
          : null,
    age: ageConfirmation && !form.ageConfirmed ? AGE_CONFIRMATION_REQUIRED_MESSAGE : null,
  };
}

export function hasErrors(errors: object): boolean {
  return Object.values(errors).some((value) => value !== null);
}

const ORDER = ['TERMS', 'PRIVACY', 'COMMUNITY_GUIDELINES', 'ACCEPTABLE_USE'];

/**
 * Documents a new collector must accept, in a stable reading order (terms first). The 18+
 * attestation (`AGE_CONFIRMATION`) is a consent to record, never a document to read, so it stays
 * out of the "I have read and accept" list and gets its own checkbox.
 */
export function requiredAtRegistration(documents: readonly LegalDocument[]): LegalDocument[] {
  const rank = (type: string) => {
    const index = ORDER.indexOf(type);
    return index === -1 ? ORDER.length : index;
  };
  return documents
    .filter((document) => document.requiredAtRegistration && !isAgeConfirmation(document))
    .sort((a, b) => rank(a.documentType) - rank(b.documentType));
}

/** The consents of a sign-up: every required document, then the 18+ attestation when published. */
export function consentsFor(
  documents: readonly LegalDocument[],
  ageConfirmation: LegalDocument | null = null
): ConsentRequest[] {
  const consents: ConsentRequest[] = documents.map((document) => ({
    documentType: document.documentType,
    version: document.version,
  }));
  if (ageConfirmation) {
    consents.push(ageConsentFor(ageConfirmation));
  }
  return consents;
}

export type RegistrationStep = 'account' | 'consents' | 'verification';

export interface RegistrationDeps {
  /** Firebase sign-up (skipped when this email is already signed in after a failed attempt). */
  signUp: (email: string, password: string, displayName: string) => Promise<unknown>;
  currentEmail: () => string | null;
  acceptConsents: (consents: readonly ConsentRequest[]) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  onStep?: (step: RegistrationStep) => void;
}

/**
 * Runs the sign-up steps. A failure rejects with the original error (AuthError or ApiError); a
 * retry after a consent failure reuses the Firebase account already created. The verification
 * email is best effort (the verify-email screen offers "Resend").
 */
export async function register(
  form: Pick<SignUpForm, 'displayName' | 'email' | 'password'>,
  documents: readonly LegalDocument[],
  deps: RegistrationDeps,
  ageConfirmation: LegalDocument | null = null
): Promise<{ verificationEmailSent: boolean }> {
  const email = form.email.trim();
  if (deps.currentEmail()?.toLowerCase() !== email.toLowerCase()) {
    deps.onStep?.('account');
    await deps.signUp(email, form.password, form.displayName.trim());
  }
  deps.onStep?.('consents');
  await deps.acceptConsents(consentsFor(documents, ageConfirmation));
  deps.onStep?.('verification');
  try {
    await deps.sendEmailVerification();
    return { verificationEmailSent: true };
  } catch {
    return { verificationEmailSent: false };
  }
}
