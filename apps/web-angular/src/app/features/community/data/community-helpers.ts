import type { CommunityChannel } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';

/** `CreatePostRequest.body` / `UpdatePostRequest.body` limit. */
export const POST_MAX_LENGTH = 2000;
/** `CreateReplyRequest.body` limit. */
export const REPLY_MAX_LENGTH = 1000;

export interface ChannelGroup {
  key: string;
  label: string;
  channels: CommunityChannel[];
}

const TOPIC_KINDS = new Set(['LOOKING_FOR', 'NEW_LISTINGS', 'TRADES', 'GENERAL']);

const KIND_ICONS: Readonly<Record<string, string>> = {
  REGION: 'public',
  GAME: 'playing_cards',
  LOOKING_FOR: 'travel_explore',
  NEW_LISTINGS: 'new_releases',
  TRADES: 'swap_horiz',
  GENERAL: 'forum',
};

/** Material Symbol of a channel kind. */
export function channelIcon(kind: string): string {
  return KIND_ICONS[kind] ?? 'forum';
}

/**
 * Sidebar sections: the platform region channels (one per region, ADR 0017), then game-wide
 * channels, then the topic channels (looking for, new listings, trades, general). Server order is
 * kept inside a section. `game` narrows game-specific channels to one game; topics always stay.
 */
export function groupChannels(
  channels: readonly CommunityChannel[],
  game: string | null = null,
): ChannelGroup[] {
  const regions: CommunityChannel[] = [];
  const games: CommunityChannel[] = [];
  const topics: CommunityChannel[] = [];
  for (const channel of channels) {
    const isTopic = TOPIC_KINDS.has(channel.kind);
    if (!isTopic && game && channel.game && channel.game !== game) {
      continue;
    }
    if (channel.kind === 'REGION') {
      regions.push(channel);
    } else if (channel.kind === 'GAME') {
      games.push(channel);
    } else {
      topics.push(channel);
    }
  }
  const groups: ChannelGroup[] = [];
  if (regions.length) {
    groups.push({ key: 'regions', label: 'Regions', channels: regions });
  }
  if (games.length) {
    groups.push({ key: 'games', label: 'Games', channels: games });
  }
  if (topics.length) {
    groups.push({ key: 'topics', label: 'Topics', channels: topics });
  }
  return groups;
}

/**
 * The channel to open when none is chosen: the channel of the browsed platform region (its
 * `regionLabel` is the region code), else the first regional one, else the first.
 */
export function defaultChannel(
  channels: readonly CommunityChannel[],
  region: string | null = null,
): CommunityChannel | null {
  return (
    (region
      ? channels.find((channel) => channel.kind === 'REGION' && channel.regionLabel === region)
      : undefined) ??
    channels.find((channel) => channel.kind === 'REGION') ??
    channels[0] ??
    null
  );
}

/** "in 12 minutes" / "in 40 seconds". */
function waitText(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) {
    return 'in a little while';
  }
  if (seconds >= 90) {
    const minutes = Math.ceil(seconds / 60);
    return `in ${minutes} minutes`;
  }
  return `in ${seconds} seconds`;
}

/** Wording of a refused post or reply, shown under its composer. */
export function postErrorMessage(error: ApiError): string {
  switch (error.errorCode) {
    case 'RATE_LIMITED':
      return `You are posting a lot in a short time. Try again ${waitText(error.problem?.retryAfterSeconds)}.`;
    case 'VALIDATION_FAILED':
      return error.message || 'Check the text and try again.';
    case 'FEATURE_DISABLED':
      return 'The community is turned off right now.';
    case 'NOT_FOUND':
      return 'This post or channel is no longer available.';
    default:
      return friendlyMessage(error);
  }
}
