import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarketPriceSourceEnum as Source, WishPriceTerm } from '@orenji/api-client';
import { WishFieldsComponent, withCurrentTerm } from './wish-fields.component';
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

  it('shows the approximate amounts and the price source for one printing only', async () => {
    await render(false);
    expect(element.textContent).not.toContain('≈');
    await render(true);
    expect(element.textContent).toContain('85% TCG');
    expect(element.textContent).toContain('≈ 21.25 USD');
    expect(element.textContent).toContain('≈ 25.00 USD');
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
