import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EvidenceUpload, EvidenceUploaderComponent } from './evidence-uploader.component';

describe('EvidenceUploaderComponent', () => {
  let fixture: ComponentFixture<EvidenceUploaderComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:evidence');
    URL.revokeObjectURL = vi.fn();
    fixture = TestBed.createComponent(EvidenceUploaderComponent);
    fixture.componentRef.setInput('evidenceLeft', 9);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function choose(file: File): void {
    const input = element.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    );
  }

  it('previews a photo, takes a caption and emits it', () => {
    const uploads: EvidenceUpload[] = [];
    fixture.componentInstance.add.subscribe((upload) => uploads.push(upload));
    expect(element.textContent).toContain('You can add 9 more.');
    const file = new File(['x'], 'crease.png', { type: 'image/png' });
    choose(file);
    expect(element.querySelector('[data-testid="evidence-preview"] img')?.getAttribute('src')).toBe(
      'blob:evidence',
    );
    expect(element.textContent).toContain('crease.png');
    const caption = element.querySelector<HTMLInputElement>('input[matinput]')!;
    caption.value = 'Under a desk lamp';
    caption.dispatchEvent(new Event('input'));
    button('Add evidence')?.click();
    expect(uploads).toEqual([{ file, kind: 'IMAGE', caption: 'Under a desk lamp' }]);

    fixture.componentInstance.reset();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="evidence-preview"]')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:evidence');
  });

  it('shows a PDF by name and refuses other files', () => {
    choose(new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' }));
    expect(element.textContent).toContain('PDF document');
    expect(element.querySelector('[data-testid="evidence-preview"] img')).toBeNull();

    fixture.componentInstance.reset();
    fixture.detectChanges();
    choose(new File(['x'], 'clip.mp4', { type: 'video/mp4' }));
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Use a photo (JPEG, PNG or WebP) or a PDF document.',
    );
    expect(element.querySelector('[data-testid="evidence-preview"]')).toBeNull();
  });

  it('cannot pick a file once the limit is reached', () => {
    fixture.componentRef.setInput('evidenceLeft', 0);
    fixture.detectChanges();
    expect(button('Add a photo or PDF')?.disabled).toBe(true);
  });
});
