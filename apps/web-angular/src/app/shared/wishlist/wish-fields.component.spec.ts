import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WishPriceTerm } from '@orenji/api-client';
import { WishFieldsComponent, withCurrentTerm } from './wish-fields.component';
import { WishForm, createWishForm, newWishDefaults } from './wishlist-form';

const TERMS: WishPriceTerm[] = [
  { label: '80% TCG', percent: 80, orMore: false },
  { label: '85% TCG', percent: 85, orMore: false },
  { label: '100% TCG+', percent: 100, orMore: true },
];

describe('WishFieldsComponent (spec 6.6, board W6)', () => {
  let fixture: ComponentFixture<WishFieldsComponent>;
  let element: HTMLElement;
  let form: WishForm;

  async function render(): Promise<void> {
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('terms', TERMS);
    await fixture.whenStable();
  }

  function chips(): HTMLInputElement[] {
    return Array.from(
      element.querySelectorAll<HTMLInputElement>('[data-testid^="wish-term-"] input[type="radio"]'),
    );
  }

  beforeEach(() => {
    form = createWishForm(newWishDefaults());
    fixture = TestBed.createComponent(WishFieldsComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows Near Mint only, the price chips "No price" first, then the note 0 / 280', async () => {
    await render();
    const fields = Array.from(
      element.querySelectorAll('textarea, input'),
      (node) =>
        node.closest('[data-testid]')?.getAttribute('data-testid') ??
        node.getAttribute('data-testid'),
    );
    expect(fields).toEqual([
      'wish-near-mint',
      'wish-term-none',
      'wish-term-80% TCG',
      'wish-term-85% TCG',
      'wish-term-100% TCG+',
      'wish-note',
    ]);
    expect(element.textContent).toContain('Price you would pay (optional)');
    expect(element.textContent).toContain('Public note (optional)');
    expect(element.textContent).toContain('0 / 280');
    expect(chips()[0].checked).toBe(true);
    // Never an amount, and nothing of the old form.
    expect(element.textContent).not.toMatch(/≈|USD|CAD/);
    expect(element.textContent).not.toMatch(
      /Maximum price|Currency|I want to|Distance|Private|Language|Minimum condition/i,
    );
  });

  it('keeps at most one price term (radio chips), "No price" clearing it', async () => {
    await render();
    chips()[1].click();
    await fixture.whenStable();
    expect(form.controls.priceTerm.value).toBe('80% TCG');
    chips()[3].click();
    await fixture.whenStable();
    expect(form.controls.priceTerm.value).toBe('100% TCG+');
    expect(chips().filter((chip) => chip.checked)).toHaveLength(1);
    chips()[0].click();
    await fixture.whenStable();
    expect(form.controls.priceTerm.value).toBe('');
  });

  it('keeps the count in view once the note is over the limit', async () => {
    await render();
    const note = element.querySelector<HTMLTextAreaElement>('textarea')!;
    note.value = 'x'.repeat(281);
    note.dispatchEvent(new Event('input'));
    form.controls.note.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="wish-note-over"]')?.textContent).toContain(
      '281 / 280',
    );
  });

  it('offers to load the price terms again when they failed', async () => {
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('terms', []);
    fixture.componentRef.setInput('termsError', true);
    await fixture.whenStable();
    let retried = 0;
    fixture.componentInstance.retryTerms.subscribe(() => retried++);
    element.querySelector<HTMLButtonElement>('[data-testid="wish-terms-error"] button')!.click();
    expect(retried).toBe(1);
  });

  it('keeps offering a term the admin list removed, on the wish that chose it', async () => {
    expect(withCurrentTerm(TERMS, '85% TCG')).toBe(TERMS);
    expect(withCurrentTerm(TERMS, '')).toBe(TERMS);
    // The kept term sits at its percent, not after "100% TCG+".
    expect(withCurrentTerm(TERMS, '75% TCG')[0]).toEqual({
      label: '75% TCG',
      percent: 75,
      orMore: false,
    });
    expect(withCurrentTerm(TERMS, '90% TCG').map((term) => term.label)).toEqual([
      '80% TCG',
      '85% TCG',
      '90% TCG',
      '100% TCG+',
    ]);
    expect(withCurrentTerm(TERMS, '100% TCG').map((term) => term.label)).toEqual([
      '80% TCG',
      '85% TCG',
      '100% TCG',
      '100% TCG+',
    ]);
    expect(withCurrentTerm(TERMS, '120% TCG+').at(-1)?.label).toBe('120% TCG+');
    expect(withCurrentTerm(TERMS, 'cheap')).toBe(TERMS);
    form = createWishForm({ ...newWishDefaults(), priceTerm: '75% TCG' });
    await render();
    const kept = element.querySelector(
      '[data-testid="wish-term-75% TCG"] input',
    ) as HTMLInputElement;
    expect(kept.checked).toBe(true);
  });

  it('says the terms could not load, also while editing a wish that has one', async () => {
    form = createWishForm({ ...newWishDefaults(), priceTerm: '85% TCG' });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('terms', []);
    fixture.componentRef.setInput('termsError', true);
    await fixture.whenStable();
    // The wish's own term stays offered, and the missing others are explained.
    expect(element.querySelector('[data-testid="wish-term-85% TCG"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wish-terms-error"]')?.textContent).toContain(
      'The price terms could not load.',
    );
    fixture.componentRef.setInput('terms', TERMS);
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="wish-terms-error"]')).toBeNull();
  });

  it('binds Near Mint only and counts the note', async () => {
    await render();
    element.querySelector<HTMLInputElement>('[data-testid="wish-near-mint"] input')!.click();
    const note = element.querySelector<HTMLTextAreaElement>('textarea')!;
    note.value = 'Sleeved copies welcome';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(form.controls.nearMintOnly.value).toBe(true);
    expect(element.textContent).toContain('22 / 280');
  });
});
