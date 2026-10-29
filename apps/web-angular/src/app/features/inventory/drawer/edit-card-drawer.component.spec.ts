import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import type { InventoryItemResponse } from '@orenji/api-client';
import { of } from 'rxjs';
import { AppConfigService } from '../../../core/config/app-config.service';
import { ApiError } from '../../../core/http/api-error';
import { RegionContext } from '../../../core/region/region-context.service';
import { RegionsStore } from '../../../shared/regions/regions.store';
import { InventoryActions } from '../data/inventory-actions.service';
import { InventoryStore } from '../data/inventory.store';
import { binder, item } from '../testing/fixtures';
import { EditCardDrawerComponent } from './edit-card-drawer.component';

describe('EditCardDrawerComponent (spec 9.8)', () => {
  let fixture: ComponentFixture<EditCardDrawerComponent>;
  let element: HTMLElement;
  let updateItem: ReturnType<typeof vi.fn>;
  let confirmed: boolean;
  let moves: number[];
  let closed: number;

  async function create(card: InventoryItemResponse): Promise<void> {
    updateItem = vi.fn((id: string, patch: { quantity?: number }) =>
      Promise.resolve({ ...card, quantity: patch.quantity ?? card.quantity }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AppConfigService, useValue: { apiBaseUrl: () => 'http://api' } },
        {
          provide: InventoryStore,
          useValue: {
            binders: signal([binder('y', { name: 'Trades' })]),
            bindersById: signal(new Map()),
            updateItem,
            uploadImage: vi.fn(),
            deleteImage: vi.fn(),
          },
        },
        { provide: InventoryActions, useValue: { deleteOne: vi.fn(() => Promise.resolve(true)), confirmOne: vi.fn() } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirmed) }) } },
        { provide: RegionContext, useValue: { home: signal('americas-north') } },
        { provide: RegionsStore, useValue: { regionName: () => 'Americas (North)' } },
      ],
    });
    fixture = TestBed.createComponent(EditCardDrawerComponent);
    fixture.componentRef.setInput('item', card);
    fixture.componentRef.setInput('position', '1 of 9 in Trades');
    fixture.componentRef.setInput('hasNext', true);
    moves = [];
    closed = 0;
    fixture.componentInstance.navigate.subscribe((step) => moves.push(step));
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function save(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="edit-save"]')!;
  }

  function more(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[aria-label="One more"]')!;
  }

  beforeEach(() => {
    confirmed = true;
  });

  it('shows the phone\'s fields, "1 of 9 in Trades" and "No changes yet"', async () => {
    await create(item('a', { quantity: 2 }));
    expect(element.textContent).toContain('Edit card');
    expect(element.textContent).toContain('1 of 9 in Trades');
    expect(element.textContent).toContain('Check TCGplayer price');
    expect(element.textContent).toContain('Only you see it until you make it public.');
    expect(save().disabled).toBe(true);
    expect(save().textContent).toContain('No changes yet');
    expect(element.textContent).not.toContain('Condition');
  });

  it('saves only the change with confirm, then Next', async () => {
    await create(item('a', { quantity: 2 }));
    more().click();
    await fixture.whenStable();
    expect(save().disabled).toBe(false);
    element.querySelector<HTMLButtonElement>('[data-testid="edit-next"]')!.click();
    await fixture.whenStable();
    expect(updateItem).toHaveBeenCalledWith('a', { quantity: 3, confirm: true });
    expect(moves).toEqual([1]);
  });

  it('stays on the card when the save fails', async () => {
    await create(item('a', { quantity: 2 }));
    updateItem.mockImplementation(() =>
      Promise.reject(new ApiError({ errorCode: 'INTERNAL', message: 'Down', requestId: null, status: 500, fieldErrors: {} })),
    );
    more().click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('[data-testid="edit-next"]')!.click();
    await fixture.whenStable();
    expect(moves).toEqual([]);
    expect(element.querySelector('.save-error')).toBeTruthy();
  });

  it('asks "Discard your changes?" before closing with changes', async () => {
    await create(item('a', { quantity: 2 }));
    more().click();
    await fixture.whenStable();
    confirmed = false;
    await fixture.componentInstance.requestClose();
    expect(closed).toBe(0);
    confirmed = true;
    await fixture.componentInstance.requestClose();
    expect(closed).toBe(1);
  });

  it('shows an old web card\'s details read-only with "Add to public note"', async () => {
    await create(item('a', { condition: 'NEAR_MINT', conditionStated: true, language: 'en', edition: 'FIRST_EDITION' }));
    expect(element.textContent).toContain('From the old web form: Near Mint · English · 1st Edition');
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Add to public note'))!.click();
    await fixture.whenStable();
    expect(element.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('Near Mint · English · 1st Edition');
    expect(save().disabled).toBe(false);
  });

  it('Alt+↓ saves then moves; Ctrl+Enter saves', async () => {
    await create(item('a', { quantity: 2 }));
    more().click();
    await fixture.whenStable();
    element.querySelector('app-drawer-frame')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await fixture.whenStable();
    expect(updateItem).toHaveBeenCalledTimes(1);
    element.querySelector('app-drawer-frame')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    await fixture.whenStable();
    expect(moves).toEqual([1]);
  });
});
