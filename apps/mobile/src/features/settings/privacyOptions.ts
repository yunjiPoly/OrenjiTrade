import type { PrivacySettings } from '@/src/api/types';

export type PrivacyToggleKey = keyof Pick<
  PrivacySettings,
  'discoverable' | 'showOnlineStatus' | 'showLastActive' | 'searchDiscoverable' | 'wishlistVisible'
>;

/**
 * Every privacy switch of Settings › Privacy › Visibility, in the order of mockup v50 screen 52,
 * with its line where the mockup gives one.
 */
export const PRIVACY_TOGGLES: readonly { key: PrivacyToggleKey; label: string; help?: string }[] = [
  {
    key: 'discoverable',
    label: 'Show me on the map',
    help: 'Your public binders count in your state or province.',
  },
  { key: 'searchDiscoverable', label: 'Appear in collector search' },
  {
    key: 'wishlistVisible',
    label: 'Let others see what you want',
    help: 'Your wishlist on your profile, and your wishes on Home.',
  },
  { key: 'showLastActive', label: 'Show when I was last active' },
  { key: 'showOnlineStatus', label: 'Show when I am online' },
];

export const PROFILE_VISIBILITY_OPTIONS: readonly {
  value: PrivacySettings['profileVisibility'];
  label: string;
  help: string;
}[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    help: 'Anyone with an OrenjiTrade account can open your profile.',
  },
  {
    value: 'MEMBERS',
    label: 'Members (recommended)',
    help: 'Signed-in members can open your profile.',
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    help: 'Only you. You also leave the map.',
  },
];

export const MESSAGING_OPTIONS: readonly {
  value: PrivacySettings['messagingPermission'];
  label: string;
  help?: string;
}[] = [
  { value: 'EVERYONE', label: 'Everyone' },
  { value: 'MEMBERS_WITH_PROFILE', label: 'Members with a profile (recommended)' },
  {
    value: 'NOBODY',
    label: 'Nobody',
    help: 'No new conversations. Existing ones stay readable.',
  },
];

/** Settings › Privacy › "Remember my searches" (stage R5): a setting of this phone only. */
export const REMEMBER_SEARCHES = {
  title: 'Search',
  label: 'Remember my searches',
  help: 'Kept on this phone only. Turning it off clears them.',
} as const;

/** The words of Settings › Privacy (stage R13, mockup v50 screen 52). */
export const PRIVACY_COPY = {
  title: 'Privacy',
  loadError: 'We could not load your privacy settings',
  loading: 'Loading your privacy settings',
  visibility: 'Visibility',
  profile: 'Who can see your profile',
  messaging: 'Who can message you',
  saving: 'Saving…',
  saved: 'All changes saved',
  notSaved: 'Last change not saved',
  failed: 'Your change could not be saved.',
} as const;
