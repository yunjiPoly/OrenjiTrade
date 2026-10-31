/**
 * The words of the signed-out screens (stage R12, mockup v50 screens 36 to 39), one place per
 * screen. English only (owner, 2026-10-20).
 */

/** 36 Sign in. */
export const SIGN_IN_COPY = {
  wordmarkLabel: 'OrenjiTrade',
  tagline: 'Find collectors in your region who own, trade or want the cards you care about.',
  email: 'Email',
  password: 'Password',
  passwordMissing: 'Enter your password.',
  forgot: 'Forgot your password?',
  submit: 'Sign in',
  submitting: 'Signing in…',
  google: 'Continue with Google',
  notConfigured: 'Sign-in is not configured for this environment.',
  newHere: 'New to OrenjiTrade?',
  createAccount: 'Create an account',
  legal: 'Terms, privacy and community guidelines',
} as const;

/** 37 Create your account. */
export const SIGN_UP_COPY = {
  title: 'Create your account',
  intro: 'Join collectors trading in your region. You stay hidden on the map until you opt in.',
  displayName: 'Display name',
  displayNameHint: 'How other collectors see you. You can change it later.',
  email: 'Email',
  password: 'Password',
  passwordHint: (min: number) => `At least ${min} characters.`,
  documentsLoading: 'Loading the legal documents',
  documentsError: 'We could not load the terms',
  submit: 'Create account',
  google: 'Sign up with Google',
  notConfigured: 'Sign-up is not configured for this environment yet.',
  haveAccount: 'Already have an account?',
  signIn: 'Sign in',
  steps: {
    account: 'Creating your account…',
    consents: 'Saving your consent…',
    verification: 'Sending the verification email…',
  },
} as const;

/** 38 Reset password. */
export const RESET_COPY = {
  title: 'Reset your password',
  intro: 'We will email you a link to choose a new password.',
  email: 'Email',
  submit: 'Send reset link',
  submitting: 'Sending…',
  sentTitle: 'Check your inbox',
  sentText: (email: string) =>
    `If an account exists for ${email}, a reset link is on its way. Check your inbox and spam folder.`,
  backToSignIn: 'Back to sign in',
  anotherEmail: 'Use another email',
  resend: 'Resend email',
  resendIn: (seconds: number) => `Resend in ${seconds} s`,
  resent: (email: string) => `If an account exists for ${email}, a new reset link is on its way.`,
} as const;

/** 39 Verify your email. */
export const VERIFY_COPY = {
  title: 'Check your inbox',
  sentBefore: 'We sent a verification link to ',
  sentAfter: '. Open it to confirm the address, then come back here.',
  yourAddress: 'your email address',
  emulator:
    'Local development: no real email is sent. The Firebase Auth emulator lists the link in its logs and in the Emulator UI (Authentication tab).',
  notYet: 'We do not see the verification yet. Open the link, then try again.',
  resent: 'A new verification email is on its way.',
  check: 'I have verified my email',
  resend: 'Resend email',
  resendIn: (seconds: number) => `Resend in ${seconds} s`,
  later: 'Do this later',
  verified: 'Your email address is verified. Thanks!',
  continue: 'Continue',
} as const;
