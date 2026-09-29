import type { ConsentRequest, LegalDocument, MeResponse } from '@orenji/shared-types';

import { isApiError } from '@/src/api/ApiError';

/**
 * Registration = Firebase sign-up → wait for `GET /me` (provisions the account) →
 * `POST /me/consents` for every document the user ticked → verification email.
 * The validation and the orchestration are plain functions so they can be tested without
 * rendering the screen.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;
export const MIN_DISPLAY_NAME_LENGTH = 2;

export interface SignUpForm {
  displayName: string;
  email: string;
  password: string;
  confirm: string;
  /** `documentType`s the user ticked. */
  acceptedDocumentTypes: readonly string[];
}

export interface SignUpErrors {
  displayName: string | null;
  email: string | null;
  password: string | null;
  confirm: string | null;
  consents: string | null;
}

export function validateSignUp(
  form: SignUpForm,
  requiredDocuments: readonly LegalDocument[]
): SignUpErrors {
  const missingDocuments = requiredDocuments.filter(
    (document) => !form.acceptedDocumentTypes.includes(document.documentType)
  );
  return {
    displayName:
      form.displayName.trim().length < MIN_DISPLAY_NAME_LENGTH
        ? `Choose a display name (${MIN_DISPLAY_NAME_LENGTH}+ characters).`
        : null,
    email: EMAIL_PATTERN.test(form.email.trim()) ? null : 'Enter a valid email address.',
    password:
      form.password.length < MIN_PASSWORD_LENGTH
        ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : null,
    confirm: form.confirm !== form.password ? 'Passwords do not match.' : null,
    consents:
      missingDocuments.length > 0
        ? missingDocuments.length === 1
          ? `You must accept the ${missingDocuments[0]?.title ?? 'required document'} to continue.`
          : 'You must accept every required document to continue.'
        : null,
  };
}

export function hasSignUpErrors(errors: SignUpErrors): boolean {
  return Object.values(errors).some((value) => value !== null);
}

export interface CompleteRegistrationDeps {
  fetchMe: () => Promise<MeResponse>;
  acceptConsents: (consents: readonly ConsentRequest[]) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** How many times `/me` is attempted while the account is being provisioned. */
  attempts?: number;
  delayMs?: number;
}

export interface CompleteRegistrationResult {
  me: MeResponse;
  /** Consents the user ticked and the server recorded. */
  accepted: ConsentRequest[];
  /** Required consents the user did not tick (server knows more than the form did). */
  outstanding: ConsentRequest[];
  verificationEmailSent: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): boolean {
  return isApiError(error) && (error.isNetworkError || error.status >= 500);
}

/**
 * Waits for `/me` to answer (the first authenticated call provisions the account; the ID token
 * may need a moment to propagate), retrying only on transport/5xx failures.
 */
export async function waitForMe(
  fetchMe: () => Promise<MeResponse>,
  { attempts = 5, delayMs = 400, sleep = defaultSleep } = {}
): Promise<MeResponse> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchMe();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not load the account.');
}

/**
 * Runs after `session.signUpWithEmail` succeeded. Returns what still needs the user's
 * attention: `outstanding` consents route to `/(auth)/consent`, otherwise `/(auth)/verify-email`.
 */
export async function completeRegistration(
  acceptedDocumentTypes: readonly string[],
  deps: CompleteRegistrationDeps
): Promise<CompleteRegistrationResult> {
  const me = await waitForMe(deps.fetchMe, {
    attempts: deps.attempts,
    delayMs: deps.delayMs,
    sleep: deps.sleep,
  });

  const accepted = me.requiredConsents.filter((consent) =>
    acceptedDocumentTypes.includes(consent.documentType)
  );
  const outstanding = me.requiredConsents.filter(
    (consent) => !acceptedDocumentTypes.includes(consent.documentType)
  );
  if (accepted.length > 0) {
    await deps.acceptConsents(accepted);
  }

  let verificationEmailSent = false;
  try {
    await deps.sendEmailVerification();
    verificationEmailSent = true;
  } catch {
    // Not fatal: the verify-email screen offers "Resend".
  }

  return { me, accepted, outstanding, verificationEmailSent };
}
