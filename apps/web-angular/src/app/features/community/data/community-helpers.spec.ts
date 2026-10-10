import { CommunityChannel, CommunityChannelKindEnum as Kind } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { channelIcon, defaultChannel, groupChannels, postErrorMessage } from './community-helpers';

function channel(
  slug: string,
  kind: Kind,
  overrides: Partial<CommunityChannel> = {},
): CommunityChannel {
  return { id: slug, slug, name: slug, kind, description: '', postCount24h: 0, ...overrides };
}

const CHANNELS: CommunityChannel[] = [
  channel('americas-north', Kind.Region, { regionLabel: 'americas-north' }),
  channel('americas-south', Kind.Region, { regionLabel: 'americas-south' }),
  channel('europe', Kind.Region, { regionLabel: 'europe' }),
  channel('pokemon', Kind.Game, { game: 'pokemon' }),
  channel('yugioh', Kind.Game, { game: 'yugioh' }),
  channel('looking-for', Kind.LookingFor),
  channel('general', Kind.General),
];

function apiError(errorCode: string, status: number, retryAfterSeconds?: number): ApiError {
  return new ApiError(
    { errorCode, message: `server says ${errorCode}`, requestId: null, status, fieldErrors: {} },
    { problem: retryAfterSeconds ? { retryAfterSeconds } : undefined },
  );
}

describe('community helpers', () => {
  it('groups the platform region channels, then games, then topics', () => {
    const groups = groupChannels(CHANNELS);
    expect(groups.map((group) => group.label)).toEqual(['Regions', 'Games', 'Topics']);
    expect(groups[0].channels.map((c) => c.slug)).toEqual([
      'americas-north',
      'americas-south',
      'europe',
    ]);
    expect(groups[2].channels.map((c) => c.slug)).toEqual(['looking-for', 'general']);
  });

  it('narrows game channels to one game but keeps the regions and the topics', () => {
    const groups = groupChannels(CHANNELS, 'yugioh');
    expect(groups.map((group) => group.label)).toEqual(['Regions', 'Games', 'Topics']);
    expect(groups[1].channels.map((c) => c.slug)).toEqual(['yugioh']);
  });

  it("opens the browsed region's channel by default", () => {
    expect(defaultChannel(CHANNELS, 'europe')?.slug).toBe('europe');
    expect(defaultChannel(CHANNELS, 'unknown')?.slug).toBe('americas-north');
    expect(defaultChannel(CHANNELS)?.slug).toBe('americas-north');
    expect(defaultChannel([channel('general', Kind.General)])?.slug).toBe('general');
    expect(defaultChannel([])).toBeNull();
  });

  it('has an icon per kind', () => {
    expect(channelIcon('REGION')).toBe('public');
    expect(channelIcon('TRADES')).toBe('swap_horiz');
    expect(channelIcon('SOMETHING_NEW')).toBe('forum');
  });

  it('explains refused posts', () => {
    expect(postErrorMessage(apiError('DUPLICATE_POST', 409))).toContain('last 24 hours');
    expect(postErrorMessage(apiError('POST_BLOCKED', 422))).toContain('community guidelines');
    expect(postErrorMessage(apiError('POST_BLOCKED', 422))).not.toContain('server says');
    expect(postErrorMessage(apiError('RATE_LIMITED', 429, 720))).toBe(
      'You are posting a lot in a short time. Try again in 12 minutes.',
    );
    expect(postErrorMessage(apiError('RATE_LIMITED', 429, 30))).toContain('in 30 seconds');
    expect(postErrorMessage(apiError('RATE_LIMITED', 429))).toContain('in a little while');
    expect(postErrorMessage(apiError('NOT_FOUND', 404))).toBe(
      'This post or channel is no longer available.',
    );
  });
});
