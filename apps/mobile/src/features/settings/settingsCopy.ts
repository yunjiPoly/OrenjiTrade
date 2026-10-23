/**
 * The words of Settings and its pages (stage R13, mockup v50 screens 47 to 59), one place per
 * screen. English only (owner, 2026-10-20); the legal documents keep their own French texts.
 */
export const SETTINGS_COPY = {
  back: 'Back',
  saved: 'Saved',
  tryAgain: 'Try again',
  leave: 'Leave',
  keepEditing: 'Keep editing',
} as const;

/** 47 Settings. */
export const SETTINGS_HOME_COPY = {
  title: 'Settings',
  editProfile: 'Edit profile',
  profileCardLabel: (name: string, handle: string | null) =>
    handle ? `${name}, @${handle}. Edit profile` : `${name}. Edit profile`,
  profileCardLine: (handle: string | null) =>
    handle ? `@${handle} · Edit profile` : 'Edit profile',
  shipFrom: 'Where you ship from',
  location: 'Location and discoverability',
  locationLine: (place: string | null, onMap: boolean) =>
    `${place ?? 'Not set yet'} · ${onMap ? 'On the map' : 'Not on the map'}`,
  shipping: 'Shipping details',
  shippingLine: 'Address and e-Transfer, on this phone only',
  app: 'App',
  notifications: 'Notifications',
  notificationsLine: 'Push, email, quiet hours',
  privacy: 'Privacy',
  privacyLine: 'Who sees what about you',
  appearance: 'Appearance',
  safety: 'Safety',
  blocked: 'Blocked collectors',
  reports: 'My reports',
  reportsWaiting: (count: number) => `${count} waiting`,
  account: 'Account',
  legal: 'Legal',
  legalLine: 'Terms, privacy, guidelines',
  signOut: 'Sign out',
  version: (version: string | null) => (version ? `OrenjiTrade ${version}` : 'OrenjiTrade'),
} as const;

/** The theme's names, as Settings and Appearance show them. */
export const THEME_NAMES = {
  system: 'Same as the phone',
  light: 'Light',
  dark: 'Dark',
} as const;

/** 48 Edit profile. */
export const EDIT_PROFILE_COPY = {
  title: 'Edit profile',
  preview: 'Preview',
  previewLabel: 'Preview your public profile',
  loading: 'Loading your profile',
  loadError: 'We could not load your profile',
  addPicture: 'Add a picture',
  changePicture: 'Change picture',
  removePicture: 'Remove picture',
  pictureLine: 'Shown on your profile, in chats and in search. JPEG, PNG or WebP, up to 5 MB.',
  pictureUpdated: 'Profile picture updated.',
  pictureRemoved: 'Profile picture removed.',
  picturePermission: 'Allow access to your photos to choose a picture.',
  handleHint: 'Your profile address. Lowercase letters, digits and _.',
  displayName: 'Display name',
  bio: 'Bio',
  bioCount: (length: number, max: number) => `${length} / ${max}`,
  games: 'Games',
  languages: 'Languages you trade in',
  tags: 'Tags',
  tagsLimit: (max: number) => `Up to ${max}`,
  addTag: 'Add a tag',
  addTagTitle: 'Add a tag',
  done: 'Done',
  save: 'Save changes',
  saving: 'Saving…',
  noChanges: 'No changes yet',
  saved: 'Profile saved.',
  leaveTitle: 'Leave without saving?',
  leaveBody: 'Your changes to your profile are not saved yet. They are lost when you leave.',
} as const;
