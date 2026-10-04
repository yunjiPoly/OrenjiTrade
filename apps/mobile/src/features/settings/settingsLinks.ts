import type { Href } from 'expo-router';

import type { IconName } from '@/src/components/ui/EmptyState';

export interface SettingsLink {
  href: Href;
  label: string;
  detail: string;
  icon: IconName;
}

/** Phase 1 sections (web: `SETTINGS_LINKS`); later phases append theirs. */
export const SETTINGS_LINKS: readonly SettingsLink[] = [
  {
    href: '/settings/profile',
    label: 'Profile',
    detail: 'Name, handle, bio, games, tags, picture',
    icon: 'account-outline',
  },
  {
    href: '/settings/location',
    label: 'Location and discoverability',
    detail: 'Trading area and whether you appear on the map',
    icon: 'map-marker-radius-outline',
  },
  {
    href: '/settings/privacy',
    label: 'Privacy',
    detail: 'Who sees what about you',
    icon: 'shield-account-outline',
  },
  {
    href: '/settings/notifications',
    label: 'Notifications',
    detail: 'Channels, topics, quiet hours',
    icon: 'bell-outline',
  },
  {
    href: '/settings/account',
    label: 'Account',
    detail: 'Email, your data, delete account',
    icon: 'account-cog-outline',
  },
  {
    href: '/settings/appearance',
    label: 'Appearance',
    detail: 'Theme and app information',
    icon: 'palette-outline',
  },
  {
    href: '/legal',
    label: 'Legal',
    detail: 'Terms, privacy policy, guidelines',
    icon: 'file-document-outline',
  },
];
