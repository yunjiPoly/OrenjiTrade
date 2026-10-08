import type { PrivacySettings } from '@/src/api/types';

export type PrivacyToggleKey = keyof Pick<
  PrivacySettings,
  'discoverable' | 'showOnlineStatus' | 'showLastActive' | 'searchDiscoverable' | 'wishlistVisible'
>;

/** Every privacy switch with the sentence that explains it (same wording as the web). */
export const PRIVACY_TOGGLES: readonly { key: PrivacyToggleKey; label: string; help: string }[] = [
  {
    key: 'discoverable',
    label: 'Show me on the map',
    help:
      'Collectors of your region see your state or province and can open your public binders. ' +
      'When off, you are hidden from the map and from searches. Needs a location.',
  },
  {
    key: 'showLastActive',
    label: 'Show when I was last active',
    help: 'Shown as “Active today”, “this week” or “this month”, never an exact time.',
  },
  {
    key: 'showOnlineStatus',
    label: 'Show when I am online',
    help: 'A green dot on your profile while you use OrenjiTrade.',
  },
  {
    key: 'searchDiscoverable',
    label: 'Appear in collector search',
    help: 'Lets collectors find your profile by handle or name.',
  },
  {
    key: 'wishlistVisible',
    label: 'Show my wishlist on my profile',
    help: 'Helps sellers and traders offer you the cards you are looking for.',
  },
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
    label: 'Members',
    help: 'Signed-in members can open your profile (recommended).',
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    help: 'Only you can see your profile. You also disappear from the map.',
  },
];

export const MESSAGING_OPTIONS: readonly {
  value: PrivacySettings['messagingPermission'];
  label: string;
  help: string;
}[] = [
  { value: 'EVERYONE', label: 'Everyone', help: 'Any member can message you.' },
  {
    value: 'MEMBERS_WITH_PROFILE',
    label: 'Members with a profile',
    help: 'Only members who finished their profile (recommended).',
  },
  {
    value: 'NOBODY',
    label: 'Nobody',
    help: 'Turn off new conversations. Existing ones stay readable.',
  },
];
