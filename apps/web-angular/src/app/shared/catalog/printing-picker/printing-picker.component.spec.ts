import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarketPriceSourceEnum as Source, PrintingSummary } from '@orenji/api-client';
import { PrintingPickerComponent } from './printing-picker.component';
import {
  NO_FILTERS,
  PrintingSelection,
  facetOptions,
  normaliseSelection,
  selectionForRarity,
  visiblePrintings,
} from './printing-selection';

const PRINTINGS: PrintingSummary[] = [
  {
    id: 'p1',
    setId: 's1',
    setCode: 'MACR',
    setName: 'Maze of Creation',
    printingCode: 'MACR-EN036',
    rarity: 'Secret Rare',
    edition: 'FIRST_EDITION',
    language: 'en',
    finish: 'NORMAL',
    images: [{ kind: 'FRONT' as never, url: '/p1.svg' }],
    marketPrice: {
      amount: 25,
      currency: 'USD',
      source: Source.Ygoprodeck,
      updatedAt: '2026-10-01T00:00:00Z',
    },
  },
  {
    id: 'p2',
    setId: 's1',
    setCode: 'MACR',
    setName: 'Maze of Creation',
    printingCode: 'MACR-EN036',
    rarity: 'Quarter Century Secret Rare',
    edition: 'FIRST_EDITION',
    language: 'en',
    finish: 'NORMAL',
  },
  {
    id: 'p3',
    setId: 's2',
    setCode: 'RA03',
    setName: 'Rarity Collection III',
    printingCode: 'RA03-FR036',
    rarity: 'Secret Rare',
    edition: 'UNLIMITED',
    language: 'fr',
    finish: 'NORMAL',
  },
];

describe('printing selection', () => {
  it('lists the distinct facet values', () => {
    expect(facetOptions(PRINTINGS, 'rarity').map((option) => option.value)).toEqual([
      'Secret Rare',
      'Quarter Century Secret Rare',
    ]);
    expect(facetOptions(PRINTINGS, 'set').map((option) => option.label)).toEqual([
      'MACR · Maze of Creation',
      'RA03 · Rarity Collection III',
    ]);
    expect(facetOptions(PRINTINGS, 'language').map((option) => option.label)).toEqual([
      'English',
      'French',
    ]);
  });

  it('filters the printings but never hides the selected one; holders first when counted', () => {
    const french = { ...NO_FILTERS, language: 'fr' };
    expect(visiblePrintings(PRINTINGS, french, null).map((p) => p.id)).toEqual(['p3']);
    expect(visiblePrintings(PRINTINGS, french, 'p1').map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(visiblePrintings(PRINTINGS, NO_FILTERS, null, { p3: 2 }).map((p) => p.id)).toEqual([
      'p3',
      'p1',
      'p2',
    ]);
  });

  it('turns a rarity filter into "any printing of this rarity" unless the printing fits', () => {
    expect(
      selectionForRarity({ printingId: null, rarity: null }, 'Secret Rare', PRINTINGS),
    ).toEqual({
      printingId: null,
      rarity: 'Secret Rare',
    });
    expect(
      selectionForRarity({ printingId: 'p1', rarity: null }, 'Secret Rare', PRINTINGS),
    ).toEqual({
      printingId: 'p1',
      rarity: null,
    });
    expect(
      selectionForRarity(
        { printingId: 'p1', rarity: null },
        'Quarter Century Secret Rare',
        PRINTINGS,
      ),
    ).toEqual({ printingId: null, rarity: 'Quarter Century Secret Rare' });
    expect(normaliseSelection({ printingId: 'gone', rarity: null }, PRINTINGS)).toEqual({
      printingId: null,
      rarity: null,
    });
    expect(normaliseSelection({ printingId: null, rarity: 'Common' }, PRINTINGS)).toEqual({
      printingId: null,
      rarity: null,
    });
  });
});

describe('PrintingPickerComponent', () => {
  let fixture: ComponentFixture<PrintingPickerComponent>;
  let element: HTMLElement;
  let emitted: PrintingSelection[];

  async function render(
    value: PrintingSelection | null = null,
    holderCounts: Record<string, number> | null = null,
  ): Promise<void> {
    fixture.componentRef.setInput('printings', PRINTINGS);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('game', 'yugioh');
    fixture.componentRef.setInput('holderCounts', holderCounts);
    await fixture.whenStable();
  }

  function radios(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrintingPickerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(PrintingPickerComponent);
    element = fixture.nativeElement as HTMLElement;
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));
  });

  it('starts on "Any printing" and lists every printing with its rarity and price', async () => {
    await render();
    const options = radios();
    expect(options).toHaveLength(4);
    expect(options[0].checked).toBe(true);
    expect(element.querySelector('[data-testid="printing-option-any"]')).not.toBeNull();
    expect(options.every((option) => option.name === options[0].name)).toBe(true);
    expect(options[1].getAttribute('aria-label')).toBe(
      'MACR-EN036, Secret Rare, Maze of Creation, 1st Edition, English, Normal',
    );
    expect(options[2].getAttribute('aria-label')).toContain('Quarter Century Secret Rare');
    expect(element.textContent).toContain('25.00 USD');
    expect(element.querySelector('.pp__price')?.getAttribute('aria-label')).toBe(
      'TCG market price 25.00 USD',
    );
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/p1.svg');
    expect(element.textContent).not.toContain('collector');
  });

  it('selects one printing, then any printing again', async () => {
    await render();
    radios()[2].click();
    await fixture.whenStable();
    expect(emitted.at(-1)).toEqual({ printingId: 'p2', rarity: null });
    expect(radios()[2].checked).toBe(true);
    expect(element.querySelector('.pp__hint')?.textContent).toContain('Only MACR-EN036');
    radios()[0].click();
    await fixture.whenStable();
    expect(emitted.at(-1)).toEqual({ printingId: null, rarity: null });
  });

  it('shows the filters only where printings differ', async () => {
    await render();
    const filters = Array.from(
      element.querySelectorAll('[data-testid^="printing-filter-"]'),
      (node) => node.getAttribute('data-testid'),
    );
    expect(filters).toEqual([
      'printing-filter-rarity',
      'printing-filter-set',
      'printing-filter-edition',
      'printing-filter-language',
    ]);
  });

  it('chooses "any printing of a rarity" with only the rarity filter', async () => {
    await render({ printingId: null, rarity: 'Secret Rare' });
    expect(radios()[0].checked).toBe(true);
    expect(
      element.querySelector('[data-testid="printing-option-any"]')?.closest('label')?.textContent,
    ).toContain('Any printing in Secret Rare');
    // The list shows the Secret Rare printings only.
    expect(radios()).toHaveLength(3);
    expect(element.querySelector('[data-testid="printing-option-p2"]')).toBeNull();
    element.querySelector<HTMLButtonElement>('.pp__clear')!.click();
    await fixture.whenStable();
    expect(emitted.at(-1)).toEqual({ printingId: null, rarity: null });
    expect(radios()).toHaveLength(4);
  });

  it('says that set, edition and language filters only narrow the list', async () => {
    await render();
    (
      fixture.componentInstance as unknown as { setFilter(facet: string, value: string): void }
    ).setFilter('language', 'fr');
    await fixture.whenStable();
    expect(radios()).toHaveLength(2);
    expect(radios()[0].checked).toBe(true);
    // "Any printing" stays any language: only a rarity or one printing narrows the choice.
    expect(emitted).toEqual([]);
    expect(element.querySelector('.pp__hint')?.textContent).toContain(
      'The set, edition and language filters only narrow the list',
    );
  });

  it('reports an unknown printing as "any printing"', async () => {
    await render({ printingId: 'missing', rarity: null });
    await fixture.whenStable();
    expect(emitted.at(-1)).toEqual({ printingId: null, rarity: null });
    expect(radios()[0].checked).toBe(true);
  });

  it('shows the region holder counts and puts printings with holders first (card page, S3)', async () => {
    await render(null, { p3: 3, p2: 1 });
    const order = Array.from(
      element.querySelectorAll('[data-testid^="printing-option-p"]'),
      (node) => node.getAttribute('data-testid'),
    );
    expect(order).toEqual(['printing-option-p2', 'printing-option-p3', 'printing-option-p1']);
    expect(element.textContent).toContain('3 collectors');
    expect(element.textContent).toContain('1 collector');
  });
});
