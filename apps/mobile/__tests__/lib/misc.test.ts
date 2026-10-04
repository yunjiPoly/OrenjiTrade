import { ApiError } from '@/src/api/ApiError';
import { signalFromError } from '@/src/api/accountSignal';
import { friendlyError, friendlyMessage, messageOf } from '@/src/api/errorMessages';
import { blockerLabel, pendingDeletion } from '@/src/api/hooks/account';
import { exportFileName } from '@/src/features/account/exportFileName';
import { describeConsent, legalKeyOf, legalKeyOfType } from '@/src/features/legal/legalDocs';
import { formatLongDate } from '@/src/lib/dates';

import { LEGAL_DOCUMENTS, deletionFixture } from '../support/fixtures';

describe('friendly API errors (web wording)', () => {
  it('maps the codes collectors can meet', () => {
    expect(friendlyError(ApiError.network(new Error('x'))).title).toBe('You seem to be offline');
    expect(
      friendlyMessage(
        ApiError.fromProblem(429, {
          errorCode: 'RATE_LIMITED',
          message: 'slow',
          retryAfterSeconds: 30,
        })
      )
    ).toBe('Too many requests in a short time. Try again in 30 seconds.');
    expect(
      friendlyMessage(ApiError.fromProblem(409, { errorCode: 'HANDLE_TAKEN', message: 'x' }))
    ).toBe('That handle is already taken.');
    expect(
      friendlyMessage(
        ApiError.fromProblem(500, { errorCode: 'INTERNAL_ERROR', message: 'SQL state 23505' })
      )
    ).toBe('Please try again in a moment.');
    expect(
      friendlyMessage(
        ApiError.fromProblem(422, { errorCode: 'SOMETHING', message: 'Specific reason.' })
      )
    ).toBe('Specific reason.');
  });

  it('gives a fallback for anything that is not an API error', () => {
    expect(messageOf(new Error('raw'))).toBe('Something went wrong. Please try again.');
    expect(messageOf(new Error('raw'), 'Custom.')).toBe('Custom.');
  });
});

describe('account signals', () => {
  it('reads the account state an error carries', () => {
    expect(signalFromError(new Error('x'))).toBeNull();
    expect(
      signalFromError(ApiError.fromProblem(404, { errorCode: 'NOT_FOUND', message: 'x' }))
    ).toBeNull();
    expect(
      signalFromError(
        ApiError.fromProblem(403, { errorCode: 'ACCOUNT_SUSPENDED', message: 'Banned' }),
        5
      )
    ).toEqual({ kind: 'suspended', message: 'Banned', suspendedUntil: null, at: 5 });
  });
});

describe('deletion helpers', () => {
  it('finds the pending request and labels blockers', () => {
    expect(
      pendingDeletion([deletionFixture({ status: 'CANCELLED' }), deletionFixture()])?.status
    ).toBe('PENDING');
    expect(pendingDeletion([])).toBeNull();
    expect(blockerLabel('OPEN_TRADE')).toBe('You have a trade in progress.');
    expect(blockerLabel('NEW_THING')).toBe('new thing');
  });

  it('names the export like the web', () => {
    expect(exportFileName('maika', new Date('2026-10-04T12:00:00Z'))).toBe(
      'orenjitrade-export-maika-2026-10-04.json'
    );
    expect(exportFileName(null, new Date('2026-10-04T12:00:00Z'))).toBe(
      'orenjitrade-export-account-2026-10-04.json'
    );
    expect(exportFileName('../evil', new Date('2026-10-04T12:00:00Z'))).toBe(
      'orenjitrade-export-evil-2026-10-04.json'
    );
  });
});

describe('legal documents', () => {
  it('maps API documents to the in-app texts', () => {
    expect(legalKeyOf('/legal/terms')).toBe('terms');
    expect(legalKeyOf('https://www.orenjitrade.com/legal/privacy?x=1')).toBe('privacy');
    expect(legalKeyOf('/legal/unknown')).toBeNull();
    expect(legalKeyOfType('COMMUNITY_GUIDELINES')).toBe('community-guidelines');
    expect(describeConsent({ documentType: 'TERMS', version: 'v9' }, LEGAL_DOCUMENTS)).toEqual({
      documentType: 'TERMS',
      version: 'v9',
      title: 'Terms of Service',
      key: 'terms',
    });
  });
});

describe('dates', () => {
  it('formats long dates and keeps unparsable values', () => {
    expect(formatLongDate('2026-10-08T12:00:00Z')).toMatch(/2026/);
    expect(formatLongDate('not a date')).toBe('not a date');
    expect(formatLongDate(null)).toBe('');
  });
});
