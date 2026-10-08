import {
  AdminCommunityChannel,
  CreateCommunityChannelRequest,
  CreateCommunityChannelRequestKindEnum,
  UpdateCommunityChannelRequest,
} from '@orenji/api-client';

/** Channel kinds with their wording in the console. */
export const CHANNEL_KINDS: readonly {
  value: CreateCommunityChannelRequestKindEnum;
  label: string;
}[] = [
  { value: CreateCommunityChannelRequestKindEnum.Region, label: 'Region' },
  { value: CreateCommunityChannelRequestKindEnum.Game, label: 'Game' },
  { value: CreateCommunityChannelRequestKindEnum.LookingFor, label: 'Looking for' },
  { value: CreateCommunityChannelRequestKindEnum.NewListings, label: 'New listings' },
  { value: CreateCommunityChannelRequestKindEnum.Trades, label: 'Trades' },
  { value: CreateCommunityChannelRequestKindEnum.General, label: 'General' },
];

export function channelKindLabel(kind: string): string {
  return CHANNEL_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

/** Server rule for channel slugs (`CommunityService.SLUG`). */
export const CHANNEL_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CHANNEL_SLUG_MAX = 64;
export const CHANNEL_NAME_MAX = 80;
export const CHANNEL_DESCRIPTION_MAX = 500;
export const CHANNEL_REGION_MAX = 120;
export const RATE_LIMIT_MIN = 1;
export const RATE_LIMIT_MAX = 1000;
export const DEFAULT_RATE_LIMIT = 10;

/** "Québec / Pokémon" → "quebec-pokemon" (a suggestion; the moderator can change it). */
export function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CHANNEL_SLUG_MAX)
    .replace(/-+$/g, '');
}

/** Values of the channel form. */
export interface ChannelFormValue {
  name: string;
  slug: string;
  kind: CreateCommunityChannelRequestKindEnum;
  game: string;
  regionLabel: string;
  description: string;
  postRateLimitPerHour: number;
  sortOrder: number;
}

/** Only region and game channels belong to a game; only region channels to a platform region. */
export function usesGame(kind: string): boolean {
  return kind === 'REGION' || kind === 'GAME';
}

export function usesRegion(kind: string): boolean {
  return kind === 'REGION';
}

export function createChannelRequest(value: ChannelFormValue): CreateCommunityChannelRequest {
  const game = usesGame(value.kind) ? value.game.trim() : '';
  const region = usesRegion(value.kind) ? value.regionLabel.trim() : '';
  return {
    slug: value.slug.trim(),
    name: value.name.trim(),
    kind: value.kind,
    ...(game ? { game } : {}),
    ...(region ? { regionLabel: region } : {}),
    description: value.description.trim(),
    postRateLimitPerHour: value.postRateLimitPerHour,
    sortOrder: value.sortOrder,
  };
}

/**
 * The changed fields only (PATCH keeps absent fields). A blank game or region removes it, as the
 * API documents.
 */
export function updateChannelRequest(
  channel: AdminCommunityChannel,
  value: Omit<ChannelFormValue, 'slug' | 'kind'>,
): UpdateCommunityChannelRequest {
  const request: UpdateCommunityChannelRequest = {};
  const name = value.name.trim();
  const description = value.description.trim();
  const game = usesGame(channel.kind) ? value.game.trim() : '';
  const region = usesRegion(channel.kind) ? value.regionLabel.trim() : '';
  if (name !== channel.name) {
    request.name = name;
  }
  if (description !== channel.description) {
    request.description = description;
  }
  if (value.postRateLimitPerHour !== channel.postRateLimitPerHour) {
    request.postRateLimitPerHour = value.postRateLimitPerHour;
  }
  if (value.sortOrder !== channel.sortOrder) {
    request.sortOrder = value.sortOrder;
  }
  if (game !== (channel.game ?? '')) {
    request.game = game;
  }
  if (region !== (channel.regionLabel ?? '')) {
    request.regionLabel = region;
  }
  return request;
}

export type FlagStateFilter = 'OPEN' | 'RESOLVED' | 'ALL';

export const FLAG_STATE_FILTERS: readonly { value: FlagStateFilter; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ALL', label: 'All' },
];

const FLAG_SUBJECTS: Readonly<Record<string, string>> = {
  MESSAGE: 'Private message',
  COMMUNITY_POST: 'Community post',
  COMMUNITY_REPLY: 'Community reply',
  USER: 'Member activity',
};

const FLAG_REASONS: Readonly<Record<string, string>> = {
  BANNED_TERM: 'Banned term',
  RATE_THRESHOLD: 'Unusual posting rate',
  REPEATED_CONTENT: 'Repeated content',
  REPORT_THRESHOLD: 'Several reports',
};

export function flagSubjectLabel(subject: string): string {
  return FLAG_SUBJECTS[subject] ?? subject;
}

export function flagReasonLabel(reason: string): string {
  return FLAG_REASONS[reason] ?? reason;
}
