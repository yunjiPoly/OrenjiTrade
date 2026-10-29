import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppConfigService } from '../../../core/config/app-config.service';
import { binder, item } from '../testing/fixtures';
import { InventoryRow, RowAction, SelectionChange } from '../items/inventory-row';
import { InventoryTableComponent } from './inventory-table.component';

function row(id: string, overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    item: item(id),
    tag: { kind: 'private', label: 'Private', note: 'Only you can see this card.', icon: 'lock' },
    binderName: null,
    price: '$11.50',
    age: '2 d',
    dot: null,
    selected: false,
    busy: false,
    highlighted: false,
    saved: false,
    ...overrides,
  };
}

describe('InventoryTableComponent (spec 9.4)', () => {
  let fixture: ComponentFixture<InventoryTableComponent>;
  let element: HTMLElement;
  let selections: SelectionChange[];
  let actions: RowAction[];
  let opened: string[];
  let prices: { id: string; text: string | null }[];
  let all: number;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AppConfigService, useValue: { apiBaseUrl: () => 'http://api' } }],
    });
    fixture = TestBed.createComponent(InventoryTableComponent);
    fixture.componentRef.setInput('rows', [row('a', { tag: { kind: 'public', label: 'Public', note: '', icon: 'public' } }), row('b'), row('c', { price: null })]);
    fixture.componentRef.setInput('binders', [binder('y1', { name: 'Trades' }), binder('p1', { name: 'Pokédex', game: 'pokemon' })]);
    selections = [];
    actions = [];
    opened = [];
    prices = [];
    all = 0;
    fixture.componentInstance.selectedChange.subscribe((change) => selections.push(change));
    fixture.componentInstance.action.subscribe((action) => actions.push(action));
    fixture.componentInstance.open.subscribe((it) => opened.push(it.id));
    fixture.componentInstance.priceChange.subscribe((change) => prices.push({ id: change.item.id, text: change.text }));
    fixture.componentInstance.toggleAll.subscribe(() => all++);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  function rowEl(id: string): HTMLElement {
    return element.querySelector<HTMLElement>(`[role="row"][data-item-id="${id}"]`)!;
  }

  function key(target: HTMLElement, init: KeyboardEventInit): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  }

  it('is a grid of 72 px rows with the name, the code, the tag, the price or "No price"', () => {
    expect(element.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('Your cards');
    expect(rowEl('a').textContent).toContain('Card a');
    expect(rowEl('a').textContent).toContain('Public');
    expect(rowEl('a').textContent).toContain('$11.50');
    expect(rowEl('c').textContent).toContain('No price');
    expect(rowEl('a').textContent).toContain('Unfiled');
  });

  it('opens Edit card on a row click outside its controls', () => {
    rowEl('b').querySelector<HTMLElement>('.c-card')!.click();
    expect(opened).toEqual(['b']);
    rowEl('b').querySelector<HTMLElement>('.more')!.click();
    expect(opened).toEqual(['b']);
  });

  it('selects with the checkbox, Shift for a range', () => {
    const box = rowEl('c').querySelector<HTMLInputElement>('.c-sel input')!;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(selections).toEqual([{ id: 'c', selected: true, range: true }]);
  });

  it('moves with j and k, selects with Space or x, opens with Enter, Ctrl+A selects the loaded rows', async () => {
    const first = rowEl('a');
    first.focus();
    key(first, { key: 'j' });
    await fixture.whenStable();
    expect(document.activeElement).toBe(rowEl('b'));
    key(rowEl('b'), { key: ' ' });
    expect(selections.at(-1)).toEqual({ id: 'b', selected: true, range: false });
    key(rowEl('b'), { key: 'x' });
    expect(selections.length).toBe(2);
    key(rowEl('b'), { key: 'Enter' });
    expect(opened).toEqual(['b']);
    key(rowEl('b'), { key: 'a', ctrlKey: true });
    expect(all).toBe(1);
  });

  it('keeps one tab stop: the active row and its controls', () => {
    expect(rowEl('a').tabIndex).toBe(0);
    expect(rowEl('b').tabIndex).toBe(-1);
    expect(rowEl('b').querySelector<HTMLButtonElement>('.more')!.tabIndex).toBe(-1);
    expect(rowEl('a').querySelector<HTMLButtonElement>('.more')!.tabIndex).toBe(0);
  });

  it('toggles Private and Public from the tag', () => {
    rowEl('a').querySelector<HTMLButtonElement>('.cellbtn--tag')!.click();
    rowEl('b').querySelector<HTMLButtonElement>('.cellbtn--tag')!.click();
    expect(actions.map((a) => a.kind === 'visibility' && a.visibility)).toEqual(['PUBLIC', 'PUBLIC']);
  });

  it('edits the price inline: Enter saves the one text, Esc cancels', async () => {
    rowEl('b').querySelector<HTMLButtonElement>('.cellbtn--price')!.click();
    await fixture.whenStable();
    const input = element.querySelector<HTMLInputElement>('app-price-editor input')!;
    expect(input).toBeTruthy();
    const pct = element.querySelector<HTMLButtonElement>('app-price-editor [data-value="pct"]')!;
    pct.click();
    await fixture.whenStable();
    input.value = '85';
    input.dispatchEvent(new Event('input'));
    key(input, { key: 'Enter' });
    await fixture.whenStable();
    expect(prices).toEqual([{ id: 'b', text: '85% TCG' }]);
    expect(element.querySelector('app-price-editor')).toBeNull();
  });

  it('keeps a wrong price in the editor with its reason', async () => {
    rowEl('b').querySelector<HTMLButtonElement>('.cellbtn--price')!.click();
    await fixture.whenStable();
    const input = element.querySelector<HTMLInputElement>('app-price-editor input')!;
    input.value = '0';
    input.dispatchEvent(new Event('input'));
    key(input, { key: 'Enter' });
    await fixture.whenStable();
    expect(prices).toEqual([]);
    expect(element.querySelector('app-price-editor')?.textContent).toContain('Enter more than $0');
    key(input, { key: 'Escape' });
    await fixture.whenStable();
    expect(element.querySelector('app-price-editor')).toBeNull();
  });

  it('offers same-game binders and Unfiled for a card', () => {
    const options = (fixture.componentInstance as unknown as { binderOptions: (it: unknown) => { name: string }[] }).binderOptions(item('a'));
    expect(options.map((option) => option.name)).toEqual(['Trades', 'Unfiled']);
  });
});
