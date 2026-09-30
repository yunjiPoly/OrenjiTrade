import type { BulkInventoryResponse, BulkSkipped } from '@orenji/api-client';
import { bulkResultMessage, toBulkRequest } from './bulk-actions';

const NOW = Date.parse('2026-09-29T12:00:00Z');

function skipped(reason: 'UNCHANGED' | 'NOT_FOUND', id = 'x'): BulkSkipped {
  return { itemId: id, reason: reason as BulkSkipped['reason'] };
}

describe('bulk actions', () => {
  it('builds the bulk requests', () => {
    expect(
      toBulkRequest(
        { kind: 'visibility', visibility: 'TEMPORARILY_PUBLIC', duration: '1h' },
        ['a'],
        NOW,
      ),
    ).toEqual({
      itemIds: ['a'],
      action: 'SET_VISIBILITY',
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-09-29T13:00:00.000Z',
    });
    expect(toBulkRequest({ kind: 'visibility', visibility: 'PRIVATE' }, ['a'])).toEqual({
      itemIds: ['a'],
      action: 'SET_VISIBILITY',
      visibility: 'PRIVATE',
    });
    expect(toBulkRequest({ kind: 'move', binderId: null, binderName: null }, ['a', 'b'])).toEqual({
      itemIds: ['a', 'b'],
      action: 'MOVE_TO_BINDER',
    });
    expect(toBulkRequest({ kind: 'move', binderId: 'b1', binderName: 'Trades' }, ['a'])).toEqual({
      itemIds: ['a'],
      action: 'MOVE_TO_BINDER',
      binderId: 'b1',
    });
    expect(toBulkRequest({ kind: 'availability', availability: 'SALE' }, ['a'])).toEqual({
      itemIds: ['a'],
      action: 'SET_AVAILABILITY',
      availability: 'SALE',
    });
    expect(toBulkRequest({ kind: 'confirm' }, ['a']).action).toBe('CONFIRM');
    expect(toBulkRequest({ kind: 'delete' }, ['a']).action).toBe('DELETE');
  });

  it('words the outcome with skipped reasons', () => {
    const response: BulkInventoryResponse = {
      updated: 2,
      skipped: [skipped('UNCHANGED'), skipped('NOT_FOUND', 'y')],
    };
    expect(
      bulkResultMessage(
        { kind: 'visibility', visibility: 'TEMPORARILY_PUBLIC', duration: '24h' },
        response,
      ),
    ).toBe(
      '2 cards are now public for 24 hours. 1 card skipped: already in that state. 1 card skipped: no longer in your inventory.',
    );
    expect(
      bulkResultMessage(
        { kind: 'availability', availability: 'TRADE' },
        { updated: 0, skipped: [skipped('UNCHANGED'), skipped('UNCHANGED', 'z')] },
      ),
    ).toBe('Nothing changed. 2 cards skipped: already in that state.');
    expect(
      bulkResultMessage(
        { kind: 'move', binderId: 'b1', binderName: 'Trades' },
        { updated: 1, skipped: [] },
      ),
    ).toBe('1 card moved to “Trades”.');
    expect(
      bulkResultMessage({ kind: 'visibility', visibility: 'PRIVATE' }, { updated: 3, skipped: [] }),
    ).toBe('3 cards are now private.');
  });
});
