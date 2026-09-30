import { ACTION_CHOICES, resolveRequest } from './resolve-report-dialog.component';

describe('resolveRequest', () => {
  const base = { note: '  Checked the conversation.  ', notifyReporter: true, suspendUntil: '' };

  it('dismisses with NONE whatever action was picked', () => {
    expect(resolveRequest({ ...base, decision: 'DISMISSED', action: 'WARNING' })).toEqual({
      status: 'DISMISSED',
      action: 'NONE',
      note: 'Checked the conversation.',
      notifyReporter: true,
    });
  });

  it('needs an action and a note to take action', () => {
    expect(resolveRequest({ ...base, decision: 'ACTIONED', action: null })).toBeNull();
    expect(resolveRequest({ ...base, decision: 'ACTIONED', action: 'NONE' })).toBeNull();
    expect(
      resolveRequest({ ...base, note: '   ', decision: 'ACTIONED', action: 'WARNING' }),
    ).toBeNull();
    expect(resolveRequest({ ...base, decision: null, action: 'WARNING' })).toBeNull();
    expect(
      resolveRequest({ ...base, notifyReporter: false, decision: 'ACTIONED', action: 'WARNING' }),
    ).toEqual({
      status: 'ACTIONED',
      action: 'WARNING',
      note: 'Checked the conversation.',
      notifyReporter: false,
    });
  });

  it('adds the end of a suspension only for suspensions', () => {
    const suspended = resolveRequest({
      ...base,
      decision: 'ACTIONED',
      action: 'SUSPENDED',
      suspendUntil: '2099-01-31',
    });
    expect(suspended?.action).toBe('SUSPENDED');
    expect(new Date(suspended?.suspendUntil as string).getDate()).toBe(31);
    const paused = resolveRequest({
      ...base,
      decision: 'ACTIONED',
      action: 'LISTINGS_PAUSED',
      suspendUntil: '2099-01-31',
    });
    expect(paused).not.toHaveProperty('suspendUntil');
  });

  it('keeps suspensions and bans for administrators', () => {
    expect(ACTION_CHOICES.filter((choice) => choice.adminOnly).map((c) => c.value)).toEqual([
      'SUSPENDED',
      'BANNED',
    ]);
  });
});
