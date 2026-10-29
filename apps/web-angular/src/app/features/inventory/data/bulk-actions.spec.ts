import type { BulkInventoryResponse, BulkSkipped } from '@orenji/api-client';
import { item } from '../testing/fixtures';
import { bulkOutcome, bulkResultMessage, hiddenAfterPublic, toBulkRequest } from './bulk-actions';

const NOW = Date.parse('2026-09-29T12:00:00Z');

function skipped(reason: BulkSkipped['reason'] | string, id = 'x'): BulkSkipped {
  return { itemId: id, reason: reason as BulkSkipped['reason'] };
}

describe('bulk actions (web redesign spec 9.6)', () => {
  it('builds the four bulk requests of the dock', () => {
    expect(toBulkRequest({ kind: 'visibility', visibility: 'PUBLIC' }, ['a'])).toEqual({
      itemIds: ['a'],
      action: 'SET_VISIBILITY',
      visibility: 'PUBLIC',
    });
    expect(
      toBulkRequest({ kind: 'visibility', visibility: 'TEMPORARILY_PUBLIC', duration: '1h' }, ['a'], NOW)
        .publicUntil,
    ).toBe('2026-09-29T13:00:00.000Z');
    expect(toBulkRequest({ kind: 'move', binderId: null, binderName: null }, ['a', 'b'])).toEqual({
      itemIds: ['a', 'b'],
      action: 'MOVE_TO_BINDER',
    });
    expect(toBulkRequest({ kind: 'move', binderId: 'b1', binderName: 'Trades' }, ['a']).binderId).toBe('b1');
    expect(toBulkRequest({ kind: 'confirm' }, ['a']).action).toBe('CONFIRM');
    expect(toBulkRequest({ kind: 'delete' }, ['a']).action).toBe('DELETE');
  });

  it('names what changed: "Made 6 public", "Moved 4 to Trades", "6 cards deleted"', () => {
    const none: BulkInventoryResponse = { updated: 6, skipped: [] };
    expect(bulkOutcome({ kind: 'visibility', visibility: 'PUBLIC' }, none).title).toBe('Made 6 public');
    expect(bulkOutcome({ kind: 'visibility', visibility: 'PRIVATE' }, none).title).toBe('Made 6 private');
    expect(bulkOutcome({ kind: 'move', binderId: 'b', binderName: 'Trades' }, { updated: 4, skipped: [] }).title).toBe(
      'Moved 4 to Trades',
    );
    expect(bulkOutcome({ kind: 'move', binderId: null, binderName: null }, { updated: 1, skipped: [] }).title).toBe(
      'Moved 1 to Unfiled',
    );
    expect(bulkOutcome({ kind: 'delete' }, none).title).toBe('6 cards deleted');
    expect(bulkOutcome({ kind: 'confirm' }, { updated: 1, skipped: [] }).title).toBe(
      '1 card confirmed as still available',
    );
    expect(bulkOutcome({ kind: 'confirm' }, { updated: 0, skipped: [] }).title).toBe('Nothing changed');
  });

  it('says why: cards of another game, already like that, gone', () => {
    const pokemon = [item('p1', { card: { id: 'c', name: 'Iono', game: 'pokemon' } }), item('p2', { card: { id: 'd', name: 'Gardevoir', game: 'pokemon' } })];
    const outcome = bulkOutcome(
      { kind: 'move', binderId: 'b', binderName: 'Trades', binderGame: 'yugioh' },
      {
        updated: 4,
        skipped: [skipped('BINDER_GAME_MISMATCH', 'p1'), skipped('BINDER_GAME_MISMATCH', 'p2')],
      },
      pokemon,
    );
    expect(outcome.sub).toBe("2 Pokémon cards can't go in a Yu-Gi-Oh! binder.");
    expect(
      bulkResultMessage(
        { kind: 'visibility', visibility: 'PUBLIC' },
        { updated: 2, skipped: [skipped('UNCHANGED'), skipped('NOT_FOUND', 'y')] },
      ),
    ).toBe('Made 2 public. 1 was already like that. 1 is no longer in your inventory.');
    const mixed = bulkOutcome(
      { kind: 'move', binderId: 'b', binderName: 'T' },
      { updated: 0, skipped: [skipped('BINDER_GAME_MISMATCH', 'zz')] },
    );
    expect(mixed.sub).toBe("1 card of other games can't go in that binder.");
  });

  it('finds the public cards nobody sees after "Make public", and their one private binder', () => {
    const inPrivate = { id: 'b1', name: 'Trades' };
    const items = [
      item('a', { visibility: 'PUBLIC' as never, effectivePublic: false, binder: inPrivate }),
      item('b', { visibility: 'PUBLIC' as never, effectivePublic: false, binder: inPrivate }),
      item('c', { visibility: 'PUBLIC' as never, effectivePublic: true }),
    ];
    expect(hiddenAfterPublic(items, ['a', 'b', 'c'], new Set(['b1']))).toEqual({
      count: 2,
      inPrivateBinder: 2,
      binderId: 'b1',
    });
    expect(hiddenAfterPublic(items, ['c'], new Set(['b1'])).count).toBe(0);
  });
});
