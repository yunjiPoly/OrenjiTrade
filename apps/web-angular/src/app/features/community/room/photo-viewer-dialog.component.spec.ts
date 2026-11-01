import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AppConfigService } from '../../../core/config/app-config.service';
import { PhotoViewerData, PhotoViewerDialogComponent } from './photo-viewer-dialog.component';

describe('PhotoViewerDialogComponent (board W22, a phone-made post read on the web)', () => {
  const data: PhotoViewerData = {
    photos: [
      { url: '/api/v1/public/community-photos/1', width: 800, height: 600 },
      { url: '/api/v1/public/community-photos/2', width: 800, height: 600 },
    ],
    index: 0,
    handle: 'collector5',
    meta: 'Quebec · 9:12 AM',
  };

  function render(): { element: HTMLElement; update: () => void } {
    TestBed.configureTestingModule({
      imports: [PhotoViewerDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: AppConfigService, useValue: { apiBaseUrl: () => '' } },
      ],
    });
    const fixture = TestBed.createComponent(PhotoViewerDialogComponent);
    fixture.detectChanges();
    return { element: fixture.nativeElement as HTMLElement, update: () => fixture.detectChanges() };
  }

  it('its Close button is named "Close" (WCAG 4.1.2; WF review U3, A1)', () => {
    const { element } = render();
    const buttons = [...element.querySelectorAll('button')];
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Close',
      'Previous photo',
      'Next photo',
    ]);
    expect(buttons[0].hasAttribute('mat-dialog-close')).toBe(true);
  });

  it('→ and ← move between the photos, the title and a polite line saying which', () => {
    const { element, update } = render();
    const stage = element.querySelector<HTMLElement>('.pv')!;
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Photo 1 of 2');
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    update();
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Photo 2 of 2');
    expect(element.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Photo 2 of 2');
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    update();
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Photo 1 of 2');
  });
});
