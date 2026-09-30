import {
  AdminCommunityChannel,
  AdminCommunityChannelKindEnum,
  AdminCommunityChannelStatusEnum,
  CreateCommunityChannelRequestKindEnum as Kind,
} from '@orenji/api-client';
import {
  CHANNEL_SLUG_PATTERN,
  ChannelFormValue,
  channelKindLabel,
  createChannelRequest,
  flagReasonLabel,
  flagSubjectLabel,
  slugFromName,
  updateChannelRequest,
} from './admin-community-labels';

const CHANNEL: AdminCommunityChannel = {
  id: 'ch1',
  slug: 'montreal-pokemon',
  name: 'Montréal / Pokémon',
  kind: AdminCommunityChannelKindEnum.Region,
  game: 'pokemon',
  regionLabel: 'Montréal',
  description: 'Pokémon around Montréal.',
  status: AdminCommunityChannelStatusEnum.Active,
  postRateLimitPerHour: 10,
  sortOrder: 20,
  postCount24h: 3,
  updatedAt: '2026-09-30T10:00:00Z',
};

function form(overrides: Partial<ChannelFormValue> = {}): ChannelFormValue {
  return {
    name: 'Québec / Pokémon',
    slug: 'quebec-pokemon',
    kind: Kind.Region,
    game: 'pokemon',
    regionLabel: ' Québec ',
    description: ' Pokémon in Québec. ',
    postRateLimitPerHour: 10,
    sortOrder: 100,
    ...overrides,
  };
}

describe('admin community labels', () => {
  it('suggests slugs the server accepts', () => {
    expect(slugFromName('Québec / Pokémon')).toBe('quebec-pokemon');
    expect(slugFromName('  Looking For!! ')).toBe('looking-for');
    expect(slugFromName('Trois-Rivières — Magic')).toBe('trois-rivieres-magic');
    expect(CHANNEL_SLUG_PATTERN.test(slugFromName('Montréal / Yu-Gi-Oh!'))).toBe(true);
    expect(CHANNEL_SLUG_PATTERN.test('bad--slug')).toBe(false);
    expect(CHANNEL_SLUG_PATTERN.test('Upper')).toBe(false);
  });

  it('builds a create request, dropping the game and city where the kind has none', () => {
    expect(createChannelRequest(form())).toEqual({
      slug: 'quebec-pokemon',
      name: 'Québec / Pokémon',
      kind: Kind.Region,
      game: 'pokemon',
      regionLabel: 'Québec',
      description: 'Pokémon in Québec.',
      postRateLimitPerHour: 10,
      sortOrder: 100,
    });
    const topic = createChannelRequest(form({ kind: Kind.Trades, slug: 'swaps', name: 'Swaps' }));
    expect(topic.game).toBeUndefined();
    expect(topic.regionLabel).toBeUndefined();
    expect(createChannelRequest(form({ kind: Kind.Game })).regionLabel).toBeUndefined();
  });

  it('sends only the changed fields when editing', () => {
    const unchanged = {
      name: CHANNEL.name,
      game: 'pokemon',
      regionLabel: 'Montréal',
      description: CHANNEL.description,
      postRateLimitPerHour: 10,
      sortOrder: 20,
    };
    expect(updateChannelRequest(CHANNEL, unchanged)).toEqual({});
    expect(
      updateChannelRequest(CHANNEL, { ...unchanged, postRateLimitPerHour: 5, game: '' }),
    ).toEqual({ postRateLimitPerHour: 5, game: '' });
  });

  it('words kinds, flag subjects and reasons', () => {
    expect(channelKindLabel('LOOKING_FOR')).toBe('Looking for');
    expect(flagSubjectLabel('COMMUNITY_POST')).toBe('Community post');
    expect(flagReasonLabel('BANNED_TERM')).toBe('Banned term');
    expect(flagReasonLabel('NEW_REASON')).toBe('NEW_REASON');
  });
});
