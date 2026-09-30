import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AVATAR_MAX_BYTES,
  AvatarUploaderComponent,
  validateAvatarFile,
} from './avatar-uploader.component';

describe('validateAvatarFile', () => {
  it('accepts JPEG, PNG and WebP up to 5 MB', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 10 })).toBeNull();
  });

  it('rejects other types, oversized and empty files', () => {
    expect(validateAvatarFile({ type: 'image/gif', size: 10 })).toBe(
      'Use a JPEG, PNG or WebP image.',
    );
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })).toBe(
      'Choose an image smaller than 5 MB.',
    );
    expect(validateAvatarFile({ type: 'image/png', size: 0 })).toBe('That file is empty.');
  });
});

describe('AvatarUploaderComponent', () => {
  let fixture: ComponentFixture<AvatarUploaderComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    fixture = TestBed.createComponent(AvatarUploaderComponent);
    fixture.componentRef.setInput('name', 'Maïka Tremblay');
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function choose(file: File): void {
    const input = element.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('previews a valid file and emits it on save', () => {
    const uploads: File[] = [];
    fixture.componentInstance.upload.subscribe((file) => uploads.push(file));
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    choose(file);

    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:preview');
    const save = Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save picture'),
    );
    save?.click();
    expect(uploads).toEqual([file]);
  });

  it('shows the validation message and does not emit for an invalid file', () => {
    const uploads: File[] = [];
    fixture.componentInstance.upload.subscribe((file) => uploads.push(file));
    choose(new File(['x'], 'anim.gif', { type: 'image/gif' }));

    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'Use a JPEG, PNG or WebP image.',
    );
    expect(element.textContent).not.toContain('Save picture');
    expect(uploads).toEqual([]);
  });
});
