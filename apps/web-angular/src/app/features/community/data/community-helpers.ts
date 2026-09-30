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

/**
 * Sidebar sections: one per region (its game channels, e.g. "Montréal"), then game-wide channels,
 * then the topic channels (looking for, new listings, trades, general). Server order is kept inside
 * a section. `game` narrows region and game channels to one game; topics always stay.
 */
export function groupChannels(
  channels: readonly CommunityChannel[],
  game: string | null = null,
): ChannelGroup[] {
  const regions = new Map<string, CommunityChannel[]>();
  const games: CommunityChannel[] = [];
  const topics: CommunityChannel[] = [];
  for (const channel of channels) {
    const isTopic = TOPIC_KINDS.has(channel.kind);
    if (!isTopic && game && channel.game && channel.game !== game) {
      continue;
    }
    if (channel.kind === 'REGION') {
      const label = channel.regionLabel || 'Regions';
      regions.set(label, [...(regions.get(label) ?? []), channel]);
    } else if (channel.kind === 'GAME') {
      games.push(channel);
    } else {
      topics.push(channel);
    }
  }
  const groups: ChannelGroup[] = [...regions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ key: `region:${label}`, label, channels: items }));
  if (games.length) {
    groups.push({ key: 'games', label: 'Games', channels: games });
  }
  if (topics.length) {
    groups.push({ key: 'topics', label: 'Topics', channels: topics });
  }
  return groups;
}

/** The channel to open when none is chosen: the first regional one, else the first. */
export function defaultChannel(channels: readonly CommunityChannel[]): CommunityChannel | null {
  return channels.find((channel) => channel.kind === 'REGION') ?? channels[0] ?? null;
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
