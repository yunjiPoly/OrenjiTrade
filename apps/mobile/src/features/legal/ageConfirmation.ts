import type { ConsentRequest, LegalDocument } from '@/src/api/types';

/**
 * The 18+ rule (launch readiness, mirror of the web's `shared/legal/age-confirmation-checkbox`):
 * the API publishes `AGE_CONFIRMATION` in `GET /public/legal/documents` with
 * `requiredAtRegistration: false` (it is an attestation to record, never a document to read), the
 * app records it with `POST /me/consents` like the other consents, and `GET /me` reports
 * `onboarding.ageConfirmed`. Self-declaration only: nothing else is asked or verified.
 */
export const AGE_CONFIRMATION_TYPE = 'AGE_CONFIRMATION';

/** Checkbox and validation wording, English and its French equivalent (Bill 96), always both. */
export const AGE_CONFIRMATION_LABEL_EN = 'I confirm I am 18 years of age or older';
export const AGE_CONFIRMATION_LABEL_FR = 'Je confirme avoir 18 ans ou plus';
export const AGE_CONFIRMATION_ERROR =
  'You must confirm that you are 18 years of age or older to use OrenjiTrade.';
export const AGE_CONFIRMATION_ERROR_FR =
  'Vous devez confirmer avoir 18 ans ou plus pour utiliser OrenjiTrade.';

export function isAgeConfirmation(document: Pick<LegalDocument, 'documentType'>): boolean {
  return (document.documentType as string) === AGE_CONFIRMATION_TYPE;
}

/** The published `AGE_CONFIRMATION` entry (its version is the one to record), or null. */
export function ageConfirmationOf(
  documents: readonly LegalDocument[] | undefined
): LegalDocument | null {
  return documents?.find(isAgeConfirmation) ?? null;
}

/** The consent to post for the published attestation. */
export function ageConsentFor(document: LegalDocument): ConsentRequest {
  return { documentType: document.documentType, version: document.version };
}
