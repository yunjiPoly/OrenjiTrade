import type { AdminRating, AdminReference } from '@orenji/api-client';
import {
  peopleOf,
  ratingFollowedLabel,
  ratingsParams,
  ratingsTabOf,
  showFilterOf,
} from './ratings-filters';

const A = '3f2a4b5c-0000-4000-8000-000000000001';
const B = '3f2a4b5c-0000-4000-8000-000000000002';

describe('ratings filters (spec 15.4, A6)', () => {
  it('reads the tab, the state and the people from the URL', () => {
    expect(ratingsTabOf(undefined)).toBe('ratings');
    expect(ratingsTabOf('references')).toBe('references');
    expect(showFilterOf('HIDDEN')).toBe('HIDDEN');
    expect(showFilterOf('nope')).toBe('ALL');
    expect(ratingsParams({ state: 'OK', rateeId: A, raterId: 'x', page: '1' }, 20)).toEqual({
      state: 'OK',
      rateeId: A,
      raterId: undefined,
      page: 1,
      size: 20,
    });
    expect(ratingsParams({}, 20).state).toBeUndefined();
  });

  it('names the people of a page by handle for the pickers', () => {
    const rating = {
      raterId: A,
      rateeId: B,
      rating: { rater: { handle: 'lucas.tcg', displayName: 'Lucas' } },
      ratee: { handle: 'maya_k', displayName: 'Maya' },
    } as unknown as AdminRating;
    const people = peopleOf(new Map(), [rating], 'ratings');
    expect(people.get(A)?.handle).toBe('lucas.tcg');
    expect(people.get(B)?.handle).toBe('maya_k');
    const reference = {
      authorId: B,
      subjectId: A,
      reference: { author: { handle: 'maya_k', displayName: 'Maya' } },
      subject: { handle: 'lucas.tcg', displayName: 'Lucas' },
    } as unknown as AdminReference;
    expect(peopleOf(people, [reference], 'references').size).toBe(2);
  });
});

describe('ratingFollowedLabel (board A6, review fix 1)', () => {
  it('words what a rating followed as the board does, old kinds marked "(old)"', () => {
    expect(ratingFollowedLabel('SALE')).toBe('Deal in the chat');
    expect(ratingFollowedLabel('CONVERSATION_QUALIFIED')).toBe('Deal in the chat');
    expect(ratingFollowedLabel('TRADE')).toBe('Completed trade (old)');
    expect(ratingFollowedLabel('OFFER_ACCEPTED')).toBe('Accepted offer (old)');
    expect(ratingFollowedLabel('SOMETHING_NEW')).toBe('Deal in the chat');
    expect(ratingFollowedLabel(null)).toBe('');
  });
});
