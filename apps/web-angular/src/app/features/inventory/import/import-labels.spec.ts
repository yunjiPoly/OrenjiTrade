import { HttpErrorResponse } from '@angular/common/http';
import { toApiError } from '../../../core/http/api-error';
import {
  addLabel,
  doneLines,
  fileLine,
  footerLine,
  formatBytes,
  importRefusal,
  keptLine,
  limitsLine,
  refusalBeforeUpload,
  rowState,
} from './import-labels';
import { sourceOfFile } from './import-handoff.service';

const LIMITS = {
  ydkMaxBytes: 102400,
  ydkMaxLines: 500,
  csvMaxBytes: 2097152,
  csvMaxRows: 5000,
  previewTtlMinutes: 60,
};

function problem(status: number, body: Record<string, unknown>) {
  return toApiError(new HttpErrorResponse({ status, error: { message: 'x', ...body } }));
}

describe('Import words (spec 9.11, decision 22)', () => {
  it('reads the limits from the server, never the phone board\'s "1 MB and 300 lines"', () => {
    expect(limitsLine('YDK', LIMITS)).toBe('Up to 100 kB and 500 lines');
    expect(limitsLine('COLLECTR_CSV', LIMITS)).toBe('Up to 2 MB and 5,000 rows');
    expect(limitsLine('YDK', null)).toBeNull();
    expect(keptLine(LIMITS)).toBe('The preview is kept for 60 minutes.');
    expect(formatBytes(1536)).toBe('1.5 kB');
  });

  it('refuses a file too large before sending it', () => {
    expect(refusalBeforeUpload('YDK', 200_000, LIMITS)?.title).toBe('This file is too large');
    expect(refusalBeforeUpload('YDK', 2_000, LIMITS)).toBeNull();
  });

  it("explains the server's refusals plainly", () => {
    expect(
      importRefusal(problem(400, { errorCode: 'VALIDATION_FAILED', reason: 'NO_CARDS' }), 'YDK')
        .title,
    ).toBe('No card in this file');
    expect(
      importRefusal(problem(413, { errorCode: 'PAYLOAD_TOO_LARGE', fileLimit: 102400 }), 'YDK')
        .message,
    ).toBe('A deck file can be up to 100 kB.');
    expect(
      importRefusal(problem(429, { errorCode: 'RATE_LIMITED', retryAfterSeconds: 120 }), 'YDK')
        .message,
    ).toContain('in 2 minutes');
    const limit = importRefusal(
      problem(429, { errorCode: 'LIMIT_REACHED', limit: 500, used: 490 }),
      'COLLECTR_CSV',
    );
    expect(limit.message).toContain('Every collector has the same limits.');
  });

  it('counts what will be added and what was', () => {
    const summary = {
      rows: 35,
      ready: 31,
      toChoose: 3,
      unmatched: 1,
      leftOut: 0,
      copies: 69,
      items: 34,
      mergedItems: 0,
      defaultConditions: 0,
      assumedPrintings: 0,
    };
    expect(footerLine({ summary })).toEqual({
      strong: '34 cards · 69 copies',
      rest: ' will be added. They start private and unfiled.',
    });
    expect(addLabel({ summary })).toBe('Add 34 cards');
    const done = doneLines({
      result: {
        itemsCreated: 32,
        itemsMerged: 2,
        copiesAdded: 69,
        rowsImported: 34,
        copiesNotAdded: 0,
        chunksDone: 1,
        totalChunks: 1,
      },
    });
    expect(done.title).toBe('34 cards added');
    expect(done.body).toBe(
      '69 copies in all. They start private. Make the ones you trade public from Inventory.',
    );
  });

  it('names a line and its state', () => {
    expect(fileLine({ source: { passcode: '14558127' }, position: 3 })).toBe('14558127');
    expect(fileLine({ source: { set: 'LOB', number: '001' }, position: 0 })).toBe('LOB 001');
    expect(fileLine({ source: {}, position: 4 })).toBe('row 5');
    expect(rowState({ status: 'CHOOSE_PRINTING' as never, included: true, inScope: true })).toBe(
      'choose',
    );
    expect(rowState({ status: 'READY' as never, included: false, inScope: true })).toBe('out');
    expect(rowState({ status: 'UNMATCHED' as never, included: true, inScope: true })).toBe(
      'unmatched',
    );
    expect(sourceOfFile('deck.YDK')).toBe('YDK');
    expect(sourceOfFile('export.csv')).toBe('COLLECTR_CSV');
    expect(sourceOfFile('photo.png')).toBeNull();
  });
});
