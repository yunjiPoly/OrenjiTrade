import { SIGN_UP_BLOCKER_LINES, displayNameError, signUpBlocker } from './sign-up-rules';

describe('the rules of Create your account (spec 14)', () => {
  it('says what keeps "Create account" waiting, the age never covered by the documents', () => {
    const blocker = (documentsAccepted: boolean, ageConfirmed: boolean, ageNeeded = true) =>
      signUpBlocker({ documentsAccepted, ageNeeded, ageConfirmed });
    expect(blocker(false, false)).toBe('documents-and-age');
    expect(blocker(false, true)).toBe('documents');
    expect(blocker(true, false)).toBe('age');
    expect(blocker(true, true)).toBeNull();
    // An API that publishes no attestation never asks for it.
    expect(blocker(true, false, false)).toBeNull();
    expect(SIGN_UP_BLOCKER_LINES['documents-and-age']).toBe(
      'Accept the documents and confirm your age to continue.',
    );
    expect(SIGN_UP_BLOCKER_LINES.documents).toBe('Accept every document to continue.');
    expect(SIGN_UP_BLOCKER_LINES.age).toBe('Confirm that you are 18 or older to continue.');
  });

  it('asks for a display name of at most 80 characters', () => {
    expect(displayNameError('  ')).toBe('Enter a display name.');
    expect(displayNameError('Sam Tremblay')).toBeNull();
    expect(displayNameError('x'.repeat(80))).toBeNull();
    expect(displayNameError('x'.repeat(81))).toBe('Use at most 80 characters.');
  });
});
