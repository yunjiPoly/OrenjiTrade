import { deriveAccountStatus, needsOnboarding } from '@/src/account/accountStatus';
import { ApiError } from '@/src/api/ApiError';

import { NOT_ONBOARDED, meFixture } from '../support/fixtures';

const base = {
  sessionStatus: 'authenticated' as const,
  error: null,
  isPending: false,
  signal: null,
};

describe('deriveAccountStatus', () => {
  it('follows the session while Firebase restores it or nobody is signed in', () => {
    expect(deriveAccountStatus({ ...base, sessionStatus: 'loading', me: undefined }).status).toBe(
      'loading'
    );
    expect(deriveAccountStatus({ ...base, sessionStatus: 'anonymous', me: undefined }).status).toBe(
      'anonymous'
    );
  });

  it('is loading until /me answers, ready for an active account', () => {
    expect(deriveAccountStatus({ ...base, me: undefined, isPending: true }).status).toBe('loading');
    expect(deriveAccountStatus({ ...base, me: meFixture() }).status).toBe('ready');
  });

  it('asks for consent when documents are pending (from /me or a 428 elsewhere)', () => {
    const fromMe = deriveAccountStatus({
      ...base,
      me: meFixture({ requiredConsents: [{ documentType: 'TERMS', version: '2026-10-01' }] }),
    });
    expect(fromMe.status).toBe('consent-required');
    expect(fromMe.requiredConsents).toHaveLength(1);

    const fromSignal = deriveAccountStatus({
      ...base,
      me: meFixture(),
      signal: {
        kind: 'consent-required',
        requiredConsents: [{ documentType: 'PRIVACY', version: 'v2' }],
        at: 1,
      },
    });
    expect(fromSignal.status).toBe('consent-required');
    expect(fromSignal.requiredConsents[0]?.documentType).toBe('PRIVACY');
  });

  it('reports suspensions with their end date and pending deletions', () => {
    const suspended = deriveAccountStatus({
      ...base,
      me: undefined,
      error: ApiError.fromProblem(403, {
        errorCode: 'ACCOUNT_SUSPENDED',
        message: 'Suspended for spam',
        suspendedUntil: '2026-10-10T00:00:00Z',
      }),
    });
    expect(suspended.status).toBe('suspended');
    expect(suspended.suspension).toEqual({
      message: 'Suspended for spam',
      until: '2026-10-10T00:00:00Z',
    });

    const deleting = deriveAccountStatus({
      ...base,
      me: undefined,
      error: ApiError.fromProblem(403, {
        errorCode: 'ACCOUNT_SUSPENDED',
        message: 'deletion pending',
      }),
    });
    expect(deleting.status).toBe('deletion-pending');
    expect(
      deriveAccountStatus({ ...base, me: meFixture({ status: 'DELETION_REQUESTED' }) }).status
    ).toBe('deletion-pending');
    expect(deriveAccountStatus({ ...base, me: meFixture({ status: 'SUSPENDED' }) }).status).toBe(
      'suspended'
    );
  });

  it('prefers a fresher signal over the cached /me', () => {
    expect(
      deriveAccountStatus({ ...base, me: meFixture(), signal: { kind: 'deletion-pending', at: 1 } })
        .status
    ).toBe('deletion-pending');
    expect(
      deriveAccountStatus({
        ...base,
        me: meFixture(),
        signal: { kind: 'suspended', message: 'Banned', suspendedUntil: null, at: 1 },
      }).suspension
    ).toEqual({ message: 'Banned', until: null });
  });

  it('keeps working offline with a cached /me, and is an error without one', () => {
    const offline = ApiError.network(new TypeError('offline'));
    expect(deriveAccountStatus({ ...base, me: meFixture(), error: offline }).status).toBe('ready');
    expect(deriveAccountStatus({ ...base, me: undefined, error: offline }).status).toBe('error');
  });
});

describe('needsOnboarding', () => {
  it('requires a saved profile and at least one interest (web rule)', () => {
    expect(needsOnboarding(meFixture())).toBe(false);
    expect(needsOnboarding(meFixture({ onboarding: NOT_ONBOARDED }))).toBe(true);
    expect(
      needsOnboarding(
        meFixture({
          onboarding: { profileComplete: true, interestsSet: false, locationSet: false },
        })
      )
    ).toBe(true);
    // The trading area is optional ("Skip for now").
    expect(
      needsOnboarding(
        meFixture({
          onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
        })
      )
    ).toBe(false);
    expect(needsOnboarding(undefined)).toBe(false);
  });
});
