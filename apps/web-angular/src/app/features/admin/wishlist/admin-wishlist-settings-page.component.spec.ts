import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminWishlistService } from '@orenji/api-client';
import { of } from 'rxjs';
import {
  AdminWishlistSettingsPageComponent,
  parseTerms,
  termsProblem,
} from './admin-wishlist-settings-page.component';

describe('admin wishlist price terms', () => {
  it('parses one term per line or comma, trimmed and without duplicates', () => {
    expect(parseTerms(' 80% TCG\n85% TCG, 85% TCG\n\n100% TCG+ ')).toEqual([
      '80% TCG',
      '85% TCG',
      '100% TCG+',
    ]);
  });

  it('accepts "<percent>% TCG" terms with an optional "+" only', () => {
    expect(termsProblem(['80% TCG', '100% TCG+'])).toBeNull();
    expect(termsProblem(['cheap'])).toContain('"cheap" is not a term');
    expect(termsProblem(['250% TCG'])).toContain('percent 1-200');
    expect(termsProblem([])).toBe('Keep between 1 and 10 terms.');
    expect(termsProblem(Array.from({ length: 11 }, (_, index) => `${index + 1}% TCG`))).toBe(
      'Keep between 1 and 10 terms.',
    );
  });
});

describe('AdminWishlistSettingsPageComponent', () => {
  let fixture: ComponentFixture<AdminWishlistSettingsPageComponent>;
  let element: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    api = {
      getAdminWishlistSettings: vi.fn(() => of({ priceTerms: ['80% TCG', '85% TCG'] })),
      updateAdminWishlistSettings: vi.fn(({ updateWishlistSettingsRequest }) =>
        of({ priceTerms: updateWishlistSettingsRequest.priceTerms }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [AdminWishlistSettingsPageComponent],
      providers: [
        { provide: AdminWishlistService, useValue: api },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminWishlistSettingsPageComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('edits and saves the terms', async () => {
    const area = element.querySelector<HTMLTextAreaElement>('[data-testid="admin-price-terms"]')!;
    expect(area.value).toBe('80% TCG\n85% TCG');
    area.value = '80% TCG\n90% TCG';
    area.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const save = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Save terms'),
    )!;
    expect(save.disabled).toBe(false);
    save.click();
    await fixture.whenStable();
    expect(api['updateAdminWishlistSettings']).toHaveBeenCalledWith(
      { updateWishlistSettingsRequest: { priceTerms: ['80% TCG', '90% TCG'] } },
      'body',
      false,
      expect.anything(),
    );
  });

  it('refuses an invalid list before saving', async () => {
    const area = element.querySelector<HTMLTextAreaElement>('[data-testid="admin-price-terms"]')!;
    area.value = 'cheap';
    area.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.textContent).toContain('"cheap" is not a term');
    const save = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Save terms'),
    )!;
    expect(save.disabled).toBe(true);
  });
});
