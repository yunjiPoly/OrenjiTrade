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

/** 49 Location. */
export const LOCATION_COPY = {
  title: 'Location',
  loadError: 'We could not load your location',
  loading: 'Loading your location',
  onMap: 'Show me on the map',
  seenIn: (place: string) => `Collectors see you in ${place}.`,
  hidden: 'You are hidden from the map and from searches.',
  privateHidden:
    'Your profile is private, so you are hidden from the map and from searches. Change it in Privacy.',
  noPlace: 'You have not chosen a location yet, so you never appear on the map.',
  cityHint:
    'Only on your profile, and only while the switch below is on. Never used to locate you.',
  protectTitle: 'How OrenjiTrade protects where you live',
  protectLines: [
    'You choose your country and state or province. Never an address, and the app never uses GPS.',
    'The map counts binders per state or province: no pin, no point, no distance.',
    'Your city is optional and only on your profile.',
  ],
  remove: 'Remove my location',
  removeTitle: 'Remove your location?',
  removeBody:
    'You will disappear from the map and from searches in your region until you choose a location again.',
  removeConfirm: 'Remove location',
  removeKeep: 'Keep it',
  removed: 'Your location was removed.',
  save: 'Save location',
  saving: 'Saving…',
  saved: (place: string | null | undefined) => `Location saved${place ? ` · ${place}` : ''}.`,
  nowOnMap: 'You now appear on the map.',
  nowHidden: 'You are hidden from the map.',
} as const;

/** 51 Notifications. */
export const NOTIFICATION_SETTINGS_COPY = {
  title: 'Notifications',
  loadError: 'We could not load your notification preferences',
  loading: 'Loading your notification preferences',
  channels: 'Channels',
  channelsNote: 'Turn a channel off to silence it everywhere.',
  pushNote:
    'Push notifications on this device arrive with a later release; your choice is already saved.',
  wishlist: 'Wishlist alerts',
  wishlistLine: 'One alert when a card you wish for is listed in your region.',
  topics: 'What to notify me about',
  quiet: 'Quiet hours',
  quietSwitch: 'Pause push at night',
  quietLine: 'In-app notifications still arrive.',
  from: 'From',
  until: 'Until',
  timeZone: (zone: string) => `Time zone: ${zone}`,
  useDeviceZone: 'Use this phone’s time zone',
  save: 'Save preferences',
  saving: 'Saving…',
  noChanges: 'No changes yet',
  saved: 'Notification preferences saved.',
} as const;

/** 53 Appearance. */
export const APPEARANCE_COPY = {
  title: 'Appearance',
  theme: 'Theme',
  themeNote: 'New installs start in dark. Saved on this phone.',
  about: 'About',
  version: 'Version',
  versionValue: (version: string | null, environment: string | null) =>
    `${version ?? '—'}${environment ? ` (${environment})` : ''}`,
  server: 'Server',
  serverReached: (when: string) => `Reached ${when}`,
  serverApi: (name: string, version: string) => `${name} ${version}`,
  serverError: 'Server not reached',
  credits: 'Card data and images',
  notEndorsed: 'Not affiliated with or endorsed by the game publishers.',
} as const;

/** 54 Blocked collectors. */
export const BLOCKED_COPY = {
  title: 'Blocked collectors',
  intro:
    'Blocked collectors cannot message you, and you no longer see each other’s binders, profiles and posts anywhere. They are never told.',
  listLabel: 'Blocked collectors',
  line: (handle: string, when: string) => `@${handle} · blocked ${when}`,
  unblock: 'Unblock',
  unblocking: 'Unblocking…',
  unblockLabel: (name: string) => `Unblock ${name}`,
  unblocked: (name: string) => `${name} is unblocked.`,
  emptyTitle: 'You have not blocked anyone',
  emptyText: 'When you no longer want to hear from a collector, block them.',
  how: 'Block a collector from the ⋯ menu of a chat, a profile or a community post.',
  loadError: 'Blocked collectors could not load',
  loading: 'Loading blocked collectors',
} as const;

/** 55 My reports. */
export const MY_REPORTS_COPY = {
  title: 'My reports',
  intro:
    'Reports are confidential: the collector is never told who reported them, and the details of a decision stay with the moderation team.',
  waiting: (count: number) => `${count} waiting for a decision`,
  reviewed: (count: number) => `${count} reviewed`,
  listLabel: 'My reports',
  sent: (when: string) => `Sent ${when}`,
  reviewedOn: (when: string) => `reviewed ${when}`,
  rowLabel: (name: string) => `${name}. Opens their profile.`,
  emptyTitle: 'You have not reported anyone',
  emptyText:
    'If a collector scams, harasses or misleads you, use Report on their profile, in the chat menu or on their community post.',
  loadError: 'Your reports could not load',
  loading: 'Loading your reports',
} as const;

/** 56 Account. */
export const ACCOUNT_COPY = {
  title: 'Account',
  signIn: 'Sign-in',
  email: 'Email',
  verified: 'Verified',
  notVerified: 'Not verified',
  resend: 'Resend link',
  resending: 'Sending…',
  resendLine: 'We send a new link to confirm your email.',
  resent: 'Verification email sent. Check your inbox.',
  method: 'Sign-in method',
  methods: (password: boolean, google: boolean) =>
    google ? (password ? 'Email and password, Google' : 'Google') : 'Email and password',
  memberSince: 'Member since',
  staff: 'Staff roles',
  staffLine: 'What you can do in the admin console.',
  yourData: 'Your data',
  download: 'Download my data',
  downloadLine: 'One file with your profile, cards, binders, wishes and messages.',
  downloading: 'Preparing your file…',
  downloaded: (name: string) => `Your data export ${name} is ready.`,
  downloadFailed: 'The export failed. Please try again.',
  deleteTitle: 'Delete account',
  deleteText:
    'Your profile, cards, tags and location are deleted after a 7-day grace period. You will confirm it is you.',
  deleteButton: 'Delete my account',
  signOut: 'Sign out',
} as const;

/** The staff roles' names (Settings › Account, staff only). */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  MODERATOR: 'Moderator',
  ADMIN: 'Administrator',
  SUPER_ADMIN: 'Super administrator',
};

/** 57 Delete account. */
export const DELETE_ACCOUNT_COPY = {
  title: 'Delete account',
  facts: [
    {
      icon: 'clock-outline',
      text: 'You have 7 days to change your mind. Signing in lets you cancel.',
    },
    { icon: 'eye-off-outline', text: 'You leave the map, search and Home right away.' },
    { icon: 'gavel', text: 'Consent and audit records are kept as the law requires.' },
  ],
  reason: 'Why are you leaving? (optional)',
  reasonCount: (length: number, max: number) => `${length} / ${max}`,
  reasonPlaceholder: 'It helps us improve OrenjiTrade',
  exportFirst: 'Download a copy of my data first',
  password: 'Password',
  passwordHint: 'For your security, confirm your password.',
  passwordMissing: 'Enter your password to continue.',
  passwordWrong: 'That password is not correct.',
  google: 'You will confirm with Google.',
  understand: 'I understand that my profile, cards, tags and location will be permanently deleted.',
  submit: 'Delete my account',
  keep: 'Keep my account',
  sheetTitle: 'Delete your account?',
  sheetBody:
    'You will be hidden right away, and your account is deleted in 7 days unless you cancel.',
  working: 'Deleting your account',
  steps: {
    confirm: 'Confirming it is you…',
    export: 'Preparing your data export…',
    schedule: 'Scheduling the deletion…',
  },
  blockedTitle: 'Your account cannot be deleted yet',
  blockedText: 'Please resolve the following first:',
  someObligations: 'Some obligations are still open.',
  close: 'Close',
} as const;
