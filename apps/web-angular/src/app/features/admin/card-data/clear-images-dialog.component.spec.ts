import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ClearImagesDialogComponent } from './clear-images-dialog.component';

describe('ClearImagesDialogComponent (board A12)', () => {
  it('asks for one game, then closes with its slug', async () => {
    const close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ClearImagesDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            games: [{ slug: 'yugioh', name: 'Yu-Gi-Oh!', cached: 1204, mb: 652 }],
            totalMb: 652,
          },
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ClearImagesDialogComponent);
    const element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    const confirm = Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear images'),
    )!;
    confirm.click();
    await fixture.whenStable();
    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Choose the game whose images to clear.');
    const select = element.querySelector('select')!;
    select.value = 'yugioh';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(element.textContent).toContain('1,204 cached images of Yu-Gi-Oh!, 652 MB.');
    confirm.click();
    expect(close).toHaveBeenCalledWith('yugioh');
  });
});
