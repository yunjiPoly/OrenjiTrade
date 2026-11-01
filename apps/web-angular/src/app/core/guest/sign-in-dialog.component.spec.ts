import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  SignInDialogComponent,
  SignInDialogData,
  signInDialogDescription,
} from './sign-in-dialog.component';

describe('SignInDialogComponent (spec 14, board W26: 440)', () => {
  let close: ReturnType<typeof vi.fn>;

  function render(data: SignInDialogData): HTMLElement {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [SignInDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(SignInDialogComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says what the guest tried, that it is free, and the card it is about', () => {
    const element = render({
      action: { kind: 'message', listing: { itemId: 'i-1' } },
      subject: {
        kind: 'card',
        title: 'Infinite Impermanence',
        line: 'A collector · New York · $24.00',
      },
    });
    expect(element.querySelector('h2')?.textContent?.trim()).toBe(
      'Sign in to message this collector',
    );
    expect(element.textContent).toContain('It’s free. When you’re done, you come right back here.');
    const subject = element.querySelector('[data-testid="sign-in-dialog-subject"]')!;
    expect(subject.textContent).toContain('Infinite Impermanence');
    expect(subject.textContent).toContain('A collector · New York · $24.00');
    // The ids the dialog's description names (WG review A2).
    expect(element.querySelector('#sign-in-dialog-text')?.textContent).toContain('It’s free.');
    expect(element.querySelector('#sign-in-dialog-subject')).toBe(subject);
    expect(signInDialogDescription(null)).toBe('sign-in-dialog-text');
    expect(signInDialogDescription({ kind: 'person', title: 'A collector', line: 'Quebec' })).toBe(
      'sign-in-dialog-text sign-in-dialog-subject',
    );
  });

  it('[Create account], [Sign in] and "Not now" answer the step chosen', () => {
    const element = render({
      action: { kind: 'profile', listing: { binderId: 'b-1' } },
      subject: { kind: 'person', title: 'A collector', line: 'Quebec' },
    });
    expect(element.querySelector('h2')?.textContent?.trim()).toBe(
      'Sign in to see collector profiles',
    );
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Create account',
      'Sign in',
      'Not now',
    ]);
    buttons[0].click();
    expect(close).toHaveBeenLastCalledWith('sign-up');
    buttons[1].click();
    expect(close).toHaveBeenLastCalledWith('sign-in');
    buttons[2].click();
    expect(close).toHaveBeenLastCalledWith(undefined);
  });
});
