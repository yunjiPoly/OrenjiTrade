import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { GameSchema, PrintingDetail, SetSummary } from '@orenji/api-client';
import {
  PrintingEditDialogComponent,
  type PrintingEditDialogData,
} from './printing-edit-dialog.component';

/** Owner, 2026-10-20 (English cards only): Add printing offers no other language (review fix 1). */
describe('PrintingEditDialogComponent (web WH2, board A11)', () => {
  const schema = {
    editions: ['UNLIMITED', 'FIRST_EDITION'],
    languages: ['en', 'fr', 'de'],
    finishes: ['NORMAL', 'FOIL'],
  } as unknown as GameSchema;
  const sets = [{ id: 's1', code: 'LOB', name: 'Legend of Blue Eyes' }] as unknown as SetSummary[];

  function open(create: boolean, printing: Record<string, unknown> = {}) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            detail: { printing, metadata: {} } as unknown as PrintingDetail,
            schema,
            sets,
            create,
          } satisfies PrintingEditDialogData,
        },
      ],
    });
    const fixture = TestBed.createComponent(PrintingEditDialogComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, close };
  }

  it('shows a new printing’s language as English, with no choice, and sends en', () => {
    const { fixture, element, close } = open(true, { setId: 's1', collectorNumber: '001' });
    const fixed = element.querySelector<HTMLInputElement>(
      '[data-testid="printing-language-fixed"]',
    );
    expect(fixed?.value).toBe('English');
    expect(fixed?.readOnly).toBe(true);
    expect(element.querySelector('mat-select[formcontrolname="language"]')).toBeNull();
    // Even a form value from elsewhere never leaves as another language.
    (
      fixture.componentInstance as unknown as {
        form: { controls: { language: { setValue(v: string): void } } };
      }
    ).form.controls.language.setValue('fr');
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));
  });

  it('keeps a stored printing’s language editable', () => {
    const { fixture, element, close } = open(false, {
      setId: 's1',
      collectorNumber: '002',
      edition: 'UNLIMITED',
      language: 'fr',
      finish: 'NORMAL',
    });
    expect(element.querySelector('[data-testid="printing-language-fixed"]')).toBeNull();
    expect(element.querySelector('mat-select[formcontrolname="language"]')).not.toBeNull();
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ language: 'fr' }));
  });
});
