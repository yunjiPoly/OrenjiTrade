import {
  CommunityChannel,
  CommunityChannelKindEnum as Kind,
  PostResponse,
  PostResponseModerationStateEnum as Moderation,
} from '@orenji/api-client';

/** Fictional rooms and posts for the community's unit tests (web WF). */
export function fixtureRoom(
  game: string,
  overrides: Partial<CommunityChannel> = {},
): CommunityChannel {
  return {
    id: `room-${game}`,
    slug: `americas-north-${game}`,
    name: game,
    kind: Kind.Region,
    game,
    regionLabel: 'americas-north',
    description: '',
    postCount24h: 0,
    ...overrides,
  };
}

export function fixturePost(
  id: string,
  createdAt: string,
  overrides: Partial<PostResponse> = {},
): PostResponse {
  return {
    id,
    channelSlug: 'americas-north-yugioh',
    author: { id: `author-${id}`, handle: `handle_${id}`, displayName: `Name ${id}` },
    body: `Post ${id}`,
    payload: {},
    createdAt,
    replyCount: 0,
    canEdit: false,
    canDelete: false,
    moderationState: Moderation.Ok,
    ...overrides,
  };
}
