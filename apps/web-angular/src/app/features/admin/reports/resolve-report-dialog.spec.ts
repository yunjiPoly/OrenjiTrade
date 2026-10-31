import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  ACTION_CHOICES,
  ResolveReportDialogComponent,
  ResolveReportDialogData,
  resolveConfirmLabel,
  resolveRequest,
  suspendUntilError,
} from './resolve-report-dialog.component';

function renderDialog(canSuspend: boolean) {
  const close = vi.fn();
  const data: ResolveReportDialogData = {
    reportedName: 'Sam',
    reportedHandle: 'sam',
    canSuspend,
    number: '#1047',
  };
  TestBed.configureTestingModule({
    imports: [ResolveReportDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ResolveReportDialogComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  // The action radios bind their value as an input (no attribute): found by their label.
  const radio = (value: string) =>
    (element.querySelector<HTMLInputElement>(`input[aria-labelledby="resolve-label-${value}"]`) ??
      element.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`))!;
  return { fixture, element, radio, close };
}

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

describe('resolveConfirmLabel (spec 15.4, board A3)', () => {
  it('names the action on the confirm button', () => {
    expect(resolveConfirmLabel('DISMISSED', 'SUSPENDED')).toBe('Dismiss the report');
    expect(resolveConfirmLabel('ACTIONED', 'WARNING')).toBe('Warn and resolve');
    expect(resolveConfirmLabel('ACTIONED', 'LISTINGS_PAUSED')).toBe('Pause listings and resolve');
    expect(resolveConfirmLabel('ACTIONED', 'SUSPENDED')).toBe('Suspend and resolve');
    expect(resolveConfirmLabel('ACTIONED', 'BANNED')).toBe('Ban and resolve');
    expect(resolveConfirmLabel('ACTIONED', null)).toBe('Resolve report');
  });
});

describe('ResolveReportDialogComponent (review fix 1)', () => {
  it('locks Suspend and Ban for a moderator with "Administrators only."', () => {
    const { radio, element } = renderDialog(false);
    for (const value of ['SUSPENDED', 'BANNED']) {
      expect(radio(value).disabled).toBe(true);
      const described = radio(value).getAttribute('aria-describedby')!.split(' ');
      const text = described.map((id) => element.querySelector(`#${id}`)?.textContent).join(' ');
      expect(text).toContain('Administrators only.');
    }
    expect(radio('WARNING').disabled).toBe(false);
    expect(radio('LISTINGS_PAUSED').disabled).toBe(false);
  });

  it('unlocks them for an administrator', () => {
    const { radio, element } = renderDialog(true);
    expect(radio('SUSPENDED').disabled).toBe(false);
    expect(radio('BANNED').disabled).toBe(false);
    expect(element.textContent).not.toContain('Administrators only.');
  });

  it('keeps the decision and the action as two radio groups (arrow keys stay inside each)', () => {
    const { element } = renderDialog(true);
    const names = (selector: string) =>
      [...element.querySelectorAll<HTMLInputElement>(selector)].map((input) => input.name);
    expect(names('input[value="ACTIONED"], input[value="DISMISSED"]')).toEqual([
      'decision',
      'decision',
    ]);
    expect(names('input[formcontrolname="action"]')).toEqual([
      'action',
      'action',
      'action',
      'action',
    ]);
  });

  it('names each action by its label alone, its description apart', () => {
    const { radio, element } = renderDialog(false);
    const labelledBy = radio('SUSPENDED').getAttribute('aria-labelledby')!;
    expect(element.querySelector(`#${labelledBy}`)?.textContent?.trim()).toBe(
      'Suspend the account',
    );
  });

  it('refuses a past "Suspended until" in the dialog, keeping the note', () => {
    const { fixture, radio, element, close } = renderDialog(true);
    radio('SUSPENDED').click();
    fixture.detectChanges();
    const until = element.querySelector<HTMLInputElement>('#resolve-until')!;
    until.value = '2020-01-01';
    until.dispatchEvent(new Event('input'));
    const note = element.querySelector<HTMLTextAreaElement>('#resolve-note')!;
    note.value = 'Repeated scams.';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="resolve-confirm"]')!.click();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(element.querySelector('#resolve-until-error')?.textContent).toContain(
      'Choose a date after today.',
    );
    expect(until.getAttribute('aria-invalid')).toBe('true');
    expect(until.getAttribute('aria-describedby')).toContain('resolve-until-error');
    expect(note.value).toBe('Repeated scams.');
  });
});

describe('suspendUntilError', () => {
  it('accepts empty or a date from tomorrow, refuses today and the past', () => {
    expect(suspendUntilError('', '2026-10-31')).toBeNull();
    expect(suspendUntilError('2026-10-31', '2026-10-31')).toBeNull();
    expect(suspendUntilError('2027-01-01', '2026-10-31')).toBeNull();
    expect(suspendUntilError('2026-10-30', '2026-10-31')).toBe('Choose a date after today.');
    expect(suspendUntilError('2020-01-01', '2026-10-31')).toBe('Choose a date after today.');
  });
});
