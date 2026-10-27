/**
 * The words of the account-state screens (stage R12, mockup v50 screens 43 to 46), one place per
 * screen. English only (owner, 2026-10-20).
 */

/** 43 Review our terms. */
export const CONSENT_COPY = {
  intro: 'Please accept the current versions of these documents to keep using OrenjiTrade.',
  ageOnlyIntro: 'Please confirm your age to keep using OrenjiTrade.',
  allAccepted: 'You have accepted every current document.',
  loadingDocuments: 'Loading the documents',
  documentsError: 'We could not load the terms',
  ageError: 'We could not load the confirmation',
  accept: 'Accept and continue',
  accepting: 'Saving…',
  signOut: 'Sign out',
  welcomeBack: 'Thanks for confirming. Welcome back!',
  retry: 'Please try again.',
} as const;

/** 44 Suspended. */
export const SUSPENDED_COPY = {
  title: 'Your account is suspended',
  defaultReason: 'This account is suspended.',
  endsOn: (date: string) => `The suspension ends on ${date}.`,
  contactBefore:
    'While suspended you cannot use OrenjiTrade. If you think this is a mistake, write to ',
  contactAfter: ' and quote your account email.',
  supportEmail: 'support@orenjitrade.com',
  guidelines: 'Community guidelines',
  signOut: 'Sign out',
  activeTitle: 'Your account is active',
} as const;

/** 45 Scheduled for deletion. */
export const DELETION_COPY = {
  title: 'Your account is scheduled for deletion',
  scheduledBefore: 'Your account and profile will be permanently deleted on ',
  scheduledAfter: '. Until then you are hidden from the map and search.',
  noRequest: 'Your account is hidden while its deletion is pending.',
  changedMind: 'Changed your mind? Cancel the deletion and everything comes back as it was.',
  cancel: 'Cancel deletion',
  cancelling: 'Cancelling…',
  download: 'Download my data',
  downloading: 'Preparing your data…',
  exported: (name: string) => `Your data export ${name} is ready.`,
  exportFailed: 'The export failed. Please try again.',
  sessionEnded: 'Your session ended. Sign in again, then cancel the deletion.',
  signOut: 'Sign out',
  cancelledTitle: 'Deletion cancelled',
  cancelledText: 'Welcome back!',
  continue: 'Continue',
  loading: 'Loading the deletion',
} as const;

/** 46 Could not load. */
export const UNAVAILABLE_COPY = {
  title: 'We could not load your account',
  text: 'Check your connection, then try again. Nothing on your account changed.',
  timeoutTitle: 'No answer from OrenjiTrade',
  expiredTitle: 'Please sign in again',
  expiredText: 'Your session ended. Sign in again to keep using OrenjiTrade.',
  retry: 'Try again',
  retrying: 'Retrying…',
  signOut: 'Sign out',
} as const;
