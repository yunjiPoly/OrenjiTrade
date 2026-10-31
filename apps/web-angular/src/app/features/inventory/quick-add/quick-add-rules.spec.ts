import { HttpErrorResponse } from '@angular/common/http';
import type { CardSuggestion } from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { looksLikeCode, printingForCode, quickAddLimitMessage } from './quick-add-rows.component';

function limitError(): ApiError {
  return toApiError(
    new HttpErrorResponse({
      status: 429,
      error: {
        errorCode: 'LIMIT_REACHED',
        message: 'Limit reached',
        limitKey: 'inventory.items.max',
        limit: 500,
        used: 500,
        resetsAt: '2026-10-28T12:30:00Z',
      },
    }),
  );
}

describe('quick add rows (spec 9.10)', () => {
  it('tells a code from a name', () => {
    expect(looksLikeCode('MACR-EN036')).toBe(true);
    expect(looksLikeCode('lob-en001')).toBe(true);
    expect(looksLikeCode('SVX-001')).toBe(true);
    expect(looksLikeCode('Ash Blossom')).toBe(false);
    expect(looksLikeCode('MACR')).toBe(false);
  });

  it('finds the exact printing a code names, whatever its case', () => {
    const suggestions: CardSuggestion[] = [
      { kind: 'CARD' as never, id: 'c', name: 'Ash Blossom' },
      { kind: 'PRINTING' as never, id: 'c', printingId: 'p1', printingCode: 'MACR-EN036' },
    ];
    expect(printingForCode(suggestions, 'macr-en036')?.printingId).toBe('p1');
    expect(printingForCode(suggestions, 'MACR-EN037')).toBeNull();
  });

  it('names the limit, the usage and the reset, and never offers anything to buy', () => {
    const message = quickAddLimitMessage(limitError(), Date.parse('2026-10-28T12:00:00Z'));
    expect(message).toContain('limit reached');
    expect(message).toContain('You used 500 of 500.');
    expect(message).toContain('It resets in 30 minutes.');
    expect(message).toContain('Every collector has the same limits.');
    expect(message.toLowerCase()).not.toMatch(/premium|upgrade|buy|credit/);
  });
});
