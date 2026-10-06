import { ApiError } from '@/src/api/ApiError';
import {
  activityLabel,
  channelIcon,
  defaultChannel,
  groupChannels,
  postErrorMessage,
} from '@/src/features/community/communityHelpers';
import { postRequest } from '@/src/features/community/PostComposer';

import { CHANNELS, channelFixture } from '../support/fixtures';

describe('community helpers', () => {
  it('groups channels by region, game and topic, and filters by game', () => {
    const quebec = channelFixture({
      id: 'q',
      slug: 'quebec-pokemon',
      name: 'Québec · Pokémon',
      regionLabel: 'Québec',
    });
    const groups = groupChannels([...CHANNELS, quebec]);
    expect(groups.map((group) => group.label)).toEqual(['Montréal', 'Québec', 'Games', 'Topics']);
    expect(groups.find((group) => group.key === 'topics')?.channels[0]?.slug).toBe('looking-for');
    // Yu-Gi-Oh!: the Pokémon regions go, topics always stay.
    expect(groupChannels(CHANNELS, 'yugioh').map((group) => group.label)).toEqual([
      'Games',
      'Topics',
    ]);
  });

  it('opens the first regional channel by default and names the activity', () => {
    expect(defaultChannel(CHANNELS)?.slug).toBe('montreal-pokemon');
    expect(defaultChannel([CHANNELS[2]!])?.slug).toBe('looking-for');
    expect(defaultChannel([])).toBeNull();
    expect(activityLabel(1)).toBe('1 post today');
    expect(activityLabel(4)).toBe('4 posts today');
    expect(channelIcon('TRADES')).toBe('swap-horizontal');
    expect(channelIcon('SOMETHING_NEW')).toBe('forum-outline');
  });

  it('explains refused posts: per-channel rate limit, duplicates, moderation, closed', () => {
    const error = (status: number, errorCode: string, extra = {}, message = 'x') =>
      new ApiError({ status, errorCode, message, problem: extra });
    expect(postErrorMessage(error(429, 'RATE_LIMITED', { retryAfterSeconds: 600 }))).toBe(
      'You are posting a lot in a short time. Each channel limits posts per hour. Try again in 10 minutes.'
    );
    expect(postErrorMessage(error(429, 'RATE_LIMITED', { retryAfterSeconds: 30 }))).toMatch(
      /in 30 seconds\.$/
    );
    expect(postErrorMessage(error(429, 'RATE_LIMITED'))).toMatch(/in a little while\.$/);
    expect(
      postErrorMessage(error(409, 'DUPLICATE_POST', {}, 'You already posted this today.'))
    ).toBe('You already posted this today.');
    expect(postErrorMessage(error(422, 'POST_BLOCKED'))).toMatch(/community guidelines/);
    expect(postErrorMessage(error(403, 'FEATURE_DISABLED'))).toBe(
      'The community is turned off right now.'
    );
    expect(postErrorMessage(error(404, 'NOT_FOUND'))).toMatch(/no longer available/);
  });

  it('builds a post with its optional card and binder links', () => {
    expect(postRequest('  Hello  ', null, null)).toEqual({ body: 'Hello' });
    expect(
      postRequest(
        'Trading',
        {
          printingId: 'p1',
          cardId: 'c1',
          name: 'Fox',
          printingCode: null,
          imageUrl: null,
          game: null,
        },
        { binderId: 'b1', name: 'B', itemCount: 2 }
      )
    ).toEqual({ body: 'Trading', cardPrintingId: 'p1', binderId: 'b1' });
  });
});
