import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogService } from '@orenji/api-client';
import { of } from 'rxjs';
import { AppConfigService } from '../../../core/config/app-config.service';
import { RegionContext } from '../../../core/region/region-context.service';
import { RegionsStore } from '../../../shared/regions/regions.store';
import { InventoryStore } from '../data/inventory.store';
import { binder, item } from '../testing/fixtures';
import { AddCardsDrawerComponent } from './add-cards-drawer.component';

const CARD = {
  id: 'c1',
  name: 'Ash Blossom & Joyous Spring',
  game: 'yugioh',
  printings: [
    {
      id: 'p1',
      printingCode: 'MACR-EN036',
      setName: 'Maximum Crisis',
      rarity: 'Secret Rare',
      setReleaseDate: '2017-05-04',
    },
    {
      id: 'p2',
      printingCode: 'LAVD-EN008',
      setName: 'Legendary Arc-V Decks',
      rarity: 'Ultra Rare',
      setReleaseDate: '2016-09-01',
    },
  ],
};

describe('AddCardsDrawerComponent (spec 9.9)', () => {
  let fixture: ComponentFixture<AddCardsDrawerComponent>;
  let element: HTMLElement;
  let createItem: ReturnType<typeof vi.fn>;
  let many: string[];

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    createItem = vi.fn(() =>
      Promise.resolve(item('new', { card: { id: 'c1', name: CARD.name, game: 'yugioh' } })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AppConfigService, useValue: { apiBaseUrl: () => 'http://api' } },
        {
          provide: CatalogService,
          useValue: {
            suggestCards: vi.fn(() =>
              of([
                { kind: 'CARD', id: 'c1', name: CARD.name, game: 'yugioh', printingCount: 2 },
                {
                  kind: 'PRINTING',
                  id: 'c1',
                  printingId: 'p1',
                  printingCode: 'MACR-EN036',
                  setName: 'Maximum Crisis',
                  rarity: 'Secret Rare',
                },
              ]),
            ),
            getCard: vi.fn(() => of(CARD)),
          },
        },
        {
          provide: InventoryStore,
          useValue: {
            items: signal([]),
            binders: signal([binder('y', { name: 'Trades' })]),
            bindersById: signal(new Map([['y', binder('y', { name: 'Trades' })]])),
            createItem,
          },
        },
        { provide: RegionContext, useValue: { home: signal(null) } },
        { provide: RegionsStore, useValue: { regionName: () => '' } },
      ],
    });
    fixture = TestBed.createComponent(AddCardsDrawerComponent);
    fixture.componentRef.setInput('binderId', 'y');
    many = [];
    fixture.componentInstance.many.subscribe((choice) => many.push(choice));
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.useRealTimers());

  async function type(text: string): Promise<void> {
    const input = element.querySelector<HTMLInputElement>('[data-testid="add-search"]')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    await fixture.whenStable();
  }

  it('offers "Add many at once" with an empty field, and no camera', () => {
    expect(element.textContent).toContain('Add many at once');
    expect(element.textContent).toContain('Quick add rows');
    expect(element.textContent).toContain('Import a deck');
    expect(element.textContent).toContain('Import from Collectr');
    expect(element.textContent?.toLowerCase()).not.toContain('scan');
    expect(element.textContent).toContain('New cards start private. You choose what to publish.');
    [...element.querySelectorAll<HTMLButtonElement>('.many__row')][0].click();
    expect(many).toEqual(['quick']);
  });

  it('lists cards with their printings and exact printings; a card leads to its printings', async () => {
    await type('ash');
    expect(element.textContent).toContain('2 printings');
    expect(element.textContent).toContain('Exact printings');
    element.querySelector<HTMLElement>('[role="option"]')!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('2 printings. Pick the one on your card.');
  });

  it('an exact printing goes straight to the details; adding loops back to the search', async () => {
    await type('macr');
    const input = element.querySelector<HTMLInputElement>('[data-testid="add-search"]')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(element.textContent).toContain('Keep these for the next card');
    element.querySelector<HTMLButtonElement>('[data-testid="add-submit"]')!.click();
    await fixture.whenStable();
    await vi.advanceTimersByTimeAsync(10);
    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        printingId: 'p1',
        quantity: 1,
        visibility: 'PRIVATE',
        binderId: 'y',
        conditionStated: false,
      }),
    );
    expect(element.querySelector('[data-testid="add-search"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="add-done"]')).toBeTruthy();
  });
});
