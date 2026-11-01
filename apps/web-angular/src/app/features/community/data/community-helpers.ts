const KIND_ICONS: Readonly<Record<string, string>> = {
  REGION: 'public',
  GAME: 'playing_cards',
  LOOKING_FOR: 'travel_explore',
  NEW_LISTINGS: 'new_releases',
  TRADES: 'swap_horiz',
  GENERAL: 'forum',
};

/**
 * Material Symbol of a channel kind (the admin console's channel list). The collectors' side of
 * the community is the rooms since web stage WF (`community-rules.ts`).
 */
export function channelIcon(kind: string): string {
  return KIND_ICONS[kind] ?? 'forum';
}
