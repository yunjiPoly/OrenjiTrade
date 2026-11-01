/**
 * The rules of Create your account (spec 14, board W27; the phone's R12 `registration.ts`): what
 * keeps "Create account" waiting, in one line under it, and the display name's limits. Plain
 * functions, unit-tested without rendering the page.
 */

/** The display name's longest length (the API's limit). */
export const DISPLAY_NAME_MAX = 80;

/** Why "Create account" waits: the documents, the 18+ confirmation, or both. */
export type SignUpBlocker = 'documents-and-age' | 'documents' | 'age';

/** The reason line under the button (the phone's words, spec 14). */
export const SIGN_UP_BLOCKER_LINES: Readonly<Record<SignUpBlocker, string>> = {
  'documents-and-age': 'Accept the documents and confirm your age to continue.',
  documents: 'Accept every document to continue.',
  age: 'Confirm that you are 18 or older to continue.',
};

/**
 * What is still missing before "Create account" can go: every document due at registration
 * (`documentsAccepted`, false while none could be read) and the 18+ confirmation (`ageNeeded` is
 * false only for an API that publishes no attestation). The fields are checked when the button
 * is pressed, and the server checks stay.
 */
export function signUpBlocker(input: {
  documentsAccepted: boolean;
  ageNeeded: boolean;
  ageConfirmed: boolean;
}): SignUpBlocker | null {
  const ageOk = !input.ageNeeded || input.ageConfirmed;
  if (!input.documentsAccepted && !ageOk) {
    return 'documents-and-age';
  }
  if (!input.documentsAccepted) {
    return 'documents';
  }
  return ageOk ? null : 'age';
}

/** The display name's message, or null: it is required and at most 80 characters. */
export function displayNameError(value: string): string | null {
  const name = value.trim();
  if (!name) {
    return 'Enter a display name.';
  }
  return name.length > DISPLAY_NAME_MAX ? `Use at most ${DISPLAY_NAME_MAX} characters.` : null;
}
