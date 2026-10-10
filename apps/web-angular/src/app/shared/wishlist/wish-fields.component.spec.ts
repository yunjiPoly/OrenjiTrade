import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarketPriceSourceEnum as Source, WishPriceTerm } from '@orenji/api-client';
import { WishFieldsComponent, inSentence, withCurrentTerm } from './wish-fields.component';
import { WishForm, createWishForm, newWishDefaults } from './wishlist-form';

const TERMS: WishPriceTerm[] = [
  { label: '80% TCG', percent: 80, orMore: false },
  { label: '85% TCG', percent: 85, orMore: false },
  { label: '100% TCG+', percent: 100, orMore: true },
];

describe('WishFieldsComponent', () => {
  let fixture: ComponentFixture<WishFieldsComponent>;
  let element: HTMLElement;
  let form: WishForm;

  async function render(withPrice: boolean): Promise<void> {
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('terms', TERMS);
    fixture.componentRef.setInput(
      'marketPrice',
      withPrice
        ? {
            amount: 25,
            currency: 'USD',
            source: Source.Ygoprodeck,
            updatedAt: '2026-10-01T00:00:00Z',
          }
        : null,
    );
    await fixture.whenStable();
  }

  function termBoxes(): HTMLInputElement[] {
    return Array.from(
      element.querySelectorAll<HTMLInputElement>(
        '[data-testid^="wish-term-"] input[type="checkbox"]',
      ),
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WishFieldsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WishFieldsComponent);
    element = fixture.nativeElement as HTMLElement;
    form = createWishForm(newWishDefaults());
  });

  it('puts the public note first, then Near Mint only and the price terms', async () => {
    await render(false);
    const fields = Array.from(
      element.querySelectorAll('textarea, input[type="checkbox"]'),
      (node) =>
        node.closest('[data-testid]')?.getAttribute('data-testid') ??
        node.getAttribute('data-testid'),
    );
    expect(fields[0]).toBe('wish-note');
    expect(fields[1]).toBe('wish-near-mint');
    expect(fields.slice(2)).toEqual([
      'wish-term-80% TCG',
      'wish-term-85% TCG',
      'wish-term-100% TCG+',
    ]);
    expect(element.textContent).toContain('Public note (optional)');
    expect(element.textContent).toContain('0 / 280');
    // Nothing of the old form.
    expect(element.textContent).not.toMatch(
      /Maximum price|Currency|I want to|Distance|Private|Language|condition/i,
    );
  });

  it('keeps at most one price term', async () => {
    await render(false);
    termBoxes()[0].click();
    await fixture.whenStable();
    expect(form.controls.priceTerm.value).toBe('80% TCG');
    termBoxes()[2].click();
    await fixture.whenStable();
    expect(form.controls.priceTerm.value).toBe('100% TCG+');
    expect(termBoxes().filter((box) => box.checked)).toHaveLength(1);
    termBoxes()[2].click();
    await fixture.whenStable();
    expect(form.controls.priceTerm.value).toBe('');
  });

  it('keeps one box checked when two terms are clicked within one change detection', async () => {
    await render(false);
    // No change detection between the clicks (an automated or very quick double choice).
    termBoxes()[0].click();
    termBoxes()[1].click();
    await fixture.whenStable();
    expect(form.controls.priceTerm.value).toBe('85% TCG');
    expect(termBoxes().map((box) => box.checked)).toEqual([false, true, false]);
  });

  it('says how to see the amounts: one printing, or none without a market price', async () => {
    await render(false);
    expect(element.textContent).toContain(
      'Choose one printing under “Which copy” to see approximate amounts.',
    );
    fixture.componentRef.setInput('onePrinting', true);
    await fixture.whenStable();
    expect(element.textContent).toContain('This printing has no market price yet.');
  });

  it('shows the approximate amounts and the price source for one printing only', async () => {
    await render(false);
    expect(element.textContent).not.toContain('≈');
    await render(true);
    expect(element.textContent).toContain('85% TCG');
    expect(element.textContent).toContain('≈ 21.25 USD');
    // "100% TCG+" means 100 % or more: the amount is a floor, not an estimate.
    expect(element.textContent).toContain('≥ 25.00 USD');
    expect(element.textContent).not.toContain('≈ 25.00 USD');
    // The product name keeps its capitals inside the sentence.
    expect(element.textContent).toContain(
      'Terms relative to the TCG market price of this printing.',
    );
    expect(element.querySelector('.wf__source')?.textContent).toContain(
      'TCG market price: YGOPRODeck set price (TCGplayer-based, USD)',
    );
  });

  it('keeps offering a term the admin list removed, on the wish that chose it', async () => {
    expect(withCurrentTerm(TERMS, '85% TCG')).toBe(TERMS);
    expect(withCurrentTerm(TERMS, '')).toBe(TERMS);
    expect(withCurrentTerm(TERMS, '75% TCG').at(-1)).toEqual({
      label: '75% TCG',
      percent: 75,
      orMore: false,
    });
    form = createWishForm({ ...newWishDefaults(), priceTerm: '75% TCG' });
    await render(false);
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

  it('words a market price label inside a sentence', () => {
    expect(inSentence('TCG market price')).toBe('TCG market price');
    expect(inSentence('Sample market price')).toBe('sample market price');
    expect(inSentence('Market price')).toBe('market price');
  });

  it('binds Near Mint only and counts the note', async () => {
    await render(false);
    element.querySelector<HTMLInputElement>('[data-testid="wish-near-mint"] input')!.click();
    const note = element.querySelector<HTMLTextAreaElement>('textarea')!;
    note.value = 'Sleeved copies welcome';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(form.controls.nearMintOnly.value).toBe(true);
    expect(element.textContent).toContain('22 / 280');
  });
});
