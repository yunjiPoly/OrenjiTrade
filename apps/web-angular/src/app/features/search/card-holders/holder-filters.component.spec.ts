import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_HOLDER_FILTERS, HolderFilters } from '../data/search-params';
import { HolderFiltersComponent } from './holder-filters.component';

describe('HolderFiltersComponent', () => {
  let fixture: ComponentFixture<HolderFiltersComponent>;
  let element: HTMLElement;
  let emitted: HolderFilters[];

  function input(label: string): HTMLInputElement {
    const field = [...element.querySelectorAll('mat-form-field')].find((node) =>
      node.textContent?.includes(label),
    );
    return field!.querySelector('input')!;
  }

  async function type(label: string, value: string): Promise<void> {
    const target = input(label);
    target.value = value;
    target.dispatchEvent(new Event('input'));
    target.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(HolderFiltersComponent);
    fixture.componentRef.setInput('filters', { ...DEFAULT_HOLDER_FILTERS, page: 2 });
    emitted = [];
    fixture.componentInstance.changed.subscribe((value) => emitted.push(value));
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  it('emits valid price filters and goes back to the first page', async () => {
    await type('Max price', '50');
    expect(emitted).toEqual([{ ...DEFAULT_HOLDER_FILTERS, maxPrice: 50, page: 0 }]);
  });

  it('explains an inverted price range inline and emits nothing', async () => {
    await type('Min price', '80');
    emitted.length = 0;
    await type('Max price', '20');
    expect(emitted).toEqual([]);
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'The minimum price must not be above the maximum.',
    );
  });

  it('rejects negative prices', async () => {
    await type('Min price', '-5');
    expect(emitted).toEqual([]);
    expect(element.textContent).toContain('Enter 0 to 100000.');
  });

  it('offers to clear active filters', async () => {
    fixture.componentRef.setInput('filters', {
      ...DEFAULT_HOLDER_FILTERS,
      availability: 'SALE',
      acceptsOffers: true,
      sort: 'price',
    });
    await fixture.whenStable();
    const clear = [...element.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('Clear filters (2)'),
    );
    clear!.click();
    expect(emitted.at(-1)).toEqual({ ...DEFAULT_HOLDER_FILTERS, sort: 'price' });
  });
});
