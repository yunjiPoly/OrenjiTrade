import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import type { CommunityChannel } from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';
import { PLATFORM_REGION_NAMES } from '@/src/lib/place';

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

const KIND_ICONS: Readonly<Record<string, IconName>> = {
  REGION: 'earth',
  GAME: 'cards-outline',
  LOOKING_FOR: 'magnify',
  NEW_LISTINGS: 'new-box',
  TRADES: 'swap-horizontal',
  GENERAL: 'forum-outline',
};

/** Icon of a channel kind. */
export function channelIcon(kind: string): IconName {
  return KIND_ICONS[kind] ?? 'forum-outline';
}

/**
 * Sections of the channel list (web: `groupChannels`): the platform region channels (one per
 * region, ADR 0017), then game-wide channels, then the topic channels (looking for, new listings,
 * trades, general). Server order is kept inside a section. `game` narrows region and game
 * channels to one game; topics always stay.
 */
export function groupChannels(
  channels: readonly CommunityChannel[],
  game: string | null = null
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
 * The channel to open when none is chosen: the channel of `region` (its `regionLabel` is the
 * platform region code), else the first regional one, else the first.
 */
export function defaultChannel(
  channels: readonly CommunityChannel[],
  region: string | null = null
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

/** "Europe" for a region channel's code; an archived city channel keeps its city label. */
export function channelRegionName(label: string | null | undefined): string | null {
  return label ? (PLATFORM_REGION_NAMES[label] ?? label) : null;
}

/** "3 posts today" / "1 post today". */
export function activityLabel(count: number): string {
  return `${count} ${count === 1 ? 'post' : 'posts'} today`;
}

/** "in 12 minutes" / "in 40 seconds". */
function waitText(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) {
    return 'in a little while';
  }
  if (seconds >= 90) {
    return `in ${Math.ceil(seconds / 60)} minutes`;
  }
  return `in ${seconds} seconds`;
}

/**
 * Wording of a refused post or reply, shown under its composer (web: `postErrorMessage`): the
 * per-channel rate limit (429 with `retryAfterSeconds`), a duplicate within 24 h (409), moderation
 * (422 `POST_BLOCKED`), the community turned off (403 `FEATURE_DISABLED`).
 */
export function postErrorMessage(error: ApiError): string {
  switch (error.errorCode) {
    case 'RATE_LIMITED':
      return `You are posting a lot in a short time. Each channel limits posts per hour. Try again ${waitText(error.problem?.retryAfterSeconds)}.`;
    case 'DUPLICATE_POST':
      return error.message || 'You already posted this in the last 24 hours.';
    case 'POST_BLOCKED':
      return 'This post breaks the community guidelines, so it was not published. Please rephrase it.';
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
