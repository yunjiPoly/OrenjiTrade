import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminWishlistService } from '@orenji/api-client';
import { of } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import {
  AdminWishlistSettingsPageComponent,
  addTermProblem,
  normalizeTerm,
  parseTerms,
  sellersRead,
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
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminWishlistSettingsPageComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('adds, moves, removes and saves the terms in order', async () => {
    const list = element.querySelector('[data-testid="admin-price-terms"]')!;
    expect(
      Array.from(list.querySelectorAll('.wt__term')).map((t) => t.textContent?.trim()),
    ).toEqual(['80% TCG', '85% TCG']);
    const input = element.querySelector<HTMLInputElement>('#wt-add')!;
    input.value = '90 % tcg +';
    input.dispatchEvent(new Event('input'));
    (element.querySelector('.wt__add') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(list.textContent).toContain('90% TCG+');
    expect(list.textContent).toContain('Sellers read: about 90% of the TCG market price or more');
    element.querySelector<HTMLButtonElement>('[aria-label="Move 90% TCG+ up"]')!.click();
    element.querySelector<HTMLButtonElement>('[aria-label="Remove 80% TCG"]')!.click();
    await fixture.whenStable();
    const save = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Save terms'),
    )!;
    expect(save.disabled).toBe(false);
    save.click();
    await fixture.whenStable();
    expect(api['updateAdminWishlistSettings']).toHaveBeenCalledWith(
      { updateWishlistSettingsRequest: { priceTerms: ['90% TCG+', '85% TCG'] } },
      'body',
      false,
      expect.anything(),
    );
  });

  it('refuses a term that is not "<percent>% TCG", a duplicate, or an eleventh', async () => {
    expect(addTermProblem('cheap', ['80% TCG'])).toContain('A percent from 1 to 200');
    expect(addTermProblem('80 %', ['80% TCG'])).toBe('80% TCG is already in the list.');
    expect(addTermProblem('', [])).toBe('Type a term first.');
    expect(
      addTermProblem(
        '95% TCG',
        Array.from({ length: 10 }, (_, i) => `${i + 1}% TCG`),
      ),
    ).toBe('At most 10 terms.');
    const input = element.querySelector<HTMLInputElement>('#wt-add')!;
    input.value = 'cheap';
    input.dispatchEvent(new Event('input'));
    (element.querySelector('.wt__add') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(element.textContent).toContain('A percent from 1 to 200');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('reads each term as a seller does, never with an amount', () => {
    expect(sellersRead('85% TCG')).toBe('about 85% of the TCG market price');
    expect(sellersRead('100% TCG')).toBe('the TCG market price');
    expect(sellersRead('100% TCG+')).toBe('the TCG market price or more');
    expect(normalizeTerm(' 85 % TCG ')).toBe('85% TCG');
  });
});
