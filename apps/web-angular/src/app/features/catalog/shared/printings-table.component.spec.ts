import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrintingImageKindEnum, PrintingSummary } from '@orenji/api-client';
import { PrintingsTableComponent } from './printings-table.component';

const API = 'http://localhost:8080/api/v1/public';

const PRINTINGS: PrintingSummary[] = [
  {
    id: 'p-1',
    cardId: 'card-1',
    setId: 'set-1',
    setCode: 'AZR',
    setName: 'Azure Dawn',
    collectorNumber: 'EN001',
    printingCode: 'AZR-EN001',
    images: [
      {
        kind: PrintingImageKindEnum.Front,
        url: `${API}/card-images/img-1`,
        width: 320,
        height: 467,
      },
    ],
  },
  {
    id: 'p-2',
    cardId: 'card-2',
    setId: 'set-1',
    setCode: 'AZR',
    setName: 'Azure Dawn',
    collectorNumber: 'EN011',
    printingCode: 'AZR-EN011',
    images: [],
  },
];

describe('PrintingsTableComponent', () => {
  async function render(inputs: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PrintingsTableComponent);
    fixture.componentRef.setInput('printings', PRINTINGS);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows each printing with its API picture, named after the card (card mode)', async () => {
    const element = await render({ cardName: 'Azure-Eyes Sky Dragon', game: 'yugioh' });
    const rows = element.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const first = rows[0].querySelector('app-card-image img');
    expect(first?.getAttribute('src')).toBe(`${API}/card-images/img-1`);
    expect(first?.getAttribute('alt')).toBe('Azure-Eyes Sky Dragon');
    expect(first?.getAttribute('loading')).toBe('lazy');
    // No picture from the API: the placeholder art, still named.
    const fallback = rows[1].querySelector('[data-testid="card-image-fallback"]');
    expect(rows[1].querySelector('app-card-image img')).toBeNull();
    expect(fallback?.getAttribute('aria-label')).toBe('Azure-Eyes Sky Dragon');
    expect(element.querySelector('thead th')?.textContent?.trim()).toBe('Picture');
  });

  it('names each picture after its card in a set checklist', async () => {
    const element = await render({
      mode: 'set',
      cardNames: { 'card-1': 'Azure-Eyes Sky Dragon', 'card-2': 'Lantern Fox Spirit' },
    });
    const rows = element.querySelectorAll('tbody tr');
    expect(rows[0].querySelector('app-card-image img')?.getAttribute('alt')).toBe(
      'Azure-Eyes Sky Dragon',
    );
    expect(
      rows[1].querySelector('[data-testid="card-image-fallback"]')?.getAttribute('aria-label'),
    ).toBe('Lantern Fox Spirit');
  });
});
