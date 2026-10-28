import type { ShellArea } from './shell-layout.service';
import type { ShellIconName } from './shell-icon/shell-icon.component';

/** One area of the rail (>= 960 px) and the bottom tab bar (< 960 px). */
export interface ShellAreaLink {
  area: ShellArea;
  label: string;
  path: string;
  icon: ShellIconName;
  /** The second key of "g then a letter" (spec 4.9). */
  key: string;
}

/** The five areas in the phone's order, with the phone's labels (spec 4.6 and 16). */
export const SHELL_AREAS: readonly ShellAreaLink[] = [
  { area: 'home', label: 'Home', path: '/', icon: 'home', key: 'h' },
  { area: 'search', label: 'Search', path: '/search', icon: 'search', key: 's' },
  { area: 'inventory', label: 'Inventory', path: '/inventory', icon: 'inventory', key: 'i' },
  { area: 'messages', label: 'Messages', path: '/messages', icon: 'messages', key: 'm' },
  { area: 'profile', label: 'Profile', path: '/profile', icon: 'profile', key: 'p' },
];

/** The area of a "g then a letter" key, if any. */
export function areaOfKey(key: string): ShellAreaLink | undefined {
  return SHELL_AREAS.find((link) => link.key === key.toLowerCase());
}

/** "Messages, 2 unread chats" (the rail's and tab bar's name of Messages with its badge). */
export function messagesLabel(unread: number): string {
  if (unread <= 0) {
    return 'Messages';
  }
  return `Messages, ${unread} unread ${unread === 1 ? 'chat' : 'chats'}`;
}

/** The badge text: the count, "99+" above 99. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}
