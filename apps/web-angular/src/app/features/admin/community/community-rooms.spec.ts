import type { AdminCommunityChannel } from '@orenji/api-client';
import { rateLine, roomDraftErrors, roomTitle, roomsGrid, roomsSummary } from './community-rooms';

function channel(slug: string, extra: Record<string, unknown> = {}): AdminCommunityChannel {
  const [region, game] = slug.startsWith('americas')
    ? [slug.split('-').slice(0, 2).join('-'), slug.split('-')[2]]
    : [slug.split('-')[0], slug.split('-')[1]];
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    kind: 'REGION',
    game,
    regionLabel: region,
    description: '',
    status: 'ACTIVE',
    postRateLimitPerHour: 10,
    sortOrder: 0,
    postCount24h: 2,
    updatedAt: '2026-10-30T00:00:00Z',
    ...extra,
  } as unknown as AdminCommunityChannel;
}

describe('community rooms (spec 15.4, A5)', () => {
  it('lays the rooms out 3 regions x 5 games and keeps the older channels apart', () => {
    const channels = [
      channel('americas-north-yugioh'),
      channel('americas-north-pokemon', { status: 'ARCHIVED' }),
      channel('europe-mtg', { postCount24h: 5 }),
      channel('montreal-yugioh', {
        kind: 'REGION',
        regionLabel: 'Montréal',
        status: 'ARCHIVED',
      }),
      channel('general', { kind: 'GENERAL', game: null, regionLabel: null, status: 'ARCHIVED' }),
    ];
    const { rows, others } = roomsGrid(channels);
    expect(rows.map((row) => row.regionName)).toEqual([
      'Americas (North)',
      'Americas (South)',
      'Europe',
    ]);
    expect(rows[0].cells.map((cell) => cell.game)).toEqual([
      'yugioh',
      'pokemon',
      'mtg',
      'onepiece',
      'riftbound',
    ]);
    expect(rows[0].cells[0].room?.slug).toBe('americas-north-yugioh');
    expect(rows[0].open).toBe(1);
    expect(rows[1].cells.every((cell) => cell.room === null)).toBe(true);
    expect(others.map((other) => other.slug)).toEqual(['general', 'montreal-yugioh']);
    expect(roomsSummary(rows)).toBe('3 rooms · 2 open · 9 posts in 24 h');
  });

  it('names a room and its posting limit in words', () => {
    expect(roomTitle('americas-north', 'yugioh')).toBe('Americas (North) · Yu-Gi-Oh!');
    expect(rateLine(10)).toBe('10 an hour per member');
  });

  it("checks the drawer's fields with today's limits", () => {
    expect(
      roomDraftErrors({
        name: 'Yu-Gi-Oh!',
        description: '',
        postRateLimitPerHour: '10',
        sortOrder: '0',
      }),
    ).toEqual({});
    expect(
      roomDraftErrors({
        name: '  ',
        description: 'x'.repeat(501),
        postRateLimitPerHour: '0',
        sortOrder: '100001',
      }),
    ).toEqual({
      name: 'A name is required.',
      description: 'At most 500 characters.',
      postRateLimitPerHour: 'Between 1 and 1,000.',
      sortOrder: 'Between 0 and 100,000.',
    });
    expect(
      roomDraftErrors({
        name: 'x'.repeat(81),
        description: '',
        postRateLimitPerHour: '2.5',
        sortOrder: '',
      }),
    ).toMatchObject({
      name: 'At most 80 characters.',
      postRateLimitPerHour: 'Between 1 and 1,000.',
      sortOrder: 'Between 0 and 100,000.',
    });
  });
});
