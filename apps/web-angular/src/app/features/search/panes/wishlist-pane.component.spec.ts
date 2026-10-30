import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { SettingsService, WishlistService } from '@orenji/api-client';
import type { WishlistItemResponse } from '@orenji/api-client';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { WishlistActions } from '../../../shared/wishlist/wishlist-actions.service';
import { WishlistStore } from '../../wishlist/data/wishlist.store';
import { WishlistPaneComponent, removeConfirmation } from './wishlist-pane.component';

function wish(id: string, name: string): WishlistItemResponse {
  return {
    id,
    game: 'pokemon',
    card: { id: `card-${id}`, name, imageUrl: null },
    printing: null,
    rarity: null,
    nearMintOnly: false,
    priceTerm: null,
  } as unknown as WishlistItemResponse;
}

/** Search › Wishlist's list pane (spec 6.6, board W6). */
describe('WishlistPaneComponent', () => {
  let fixture: ComponentFixture<WishlistPaneComponent>;
  let element: HTMLElement;
  let availability: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let toast: ReturnType<typeof vi.fn>;
  let trackDock: ReturnType<typeof vi.fn>;
  let measureDock: ReturnType<typeof vi.fn>;
  const items = signal<WishlistItemResponse[]>([]);

  beforeEach(async () => {
    items.set([wish('w1', 'Pikachu'), wish('w2', 'Eevee'), wish('w3', 'Mew')]);
    availability = vi.fn(() => of({ available: ['w2'] }));
    toast = vi.fn();
    trackDock = vi.fn();
    measureDock = vi.fn();
    // The second remove fails (offline): the first is gone, two stay selected.
    remove = vi
      .fn()
      .mockImplementationOnce(async (item: WishlistItemResponse) =>
        items.set(items().filter((entry) => entry.id !== item.id)),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (item: WishlistItemResponse) =>
        items.set(items().filter((entry) => entry.id !== item.id)),
      );
    TestBed.configureTestingModule({
      imports: [WishlistPaneComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
        {
          provide: WishlistStore,
          useValue: {
            items,
            status: signal('ready'),
            readiness: signal('ready'),
            visible: signal(true),
            savingVisibility: signal(false),
            usage: signal(null),
            init: vi.fn(),
            load: vi.fn(),
            upsert: vi.fn(),
            setVisible: vi.fn(),
            find: (id: string) => items().find((entry) => entry.id === id) ?? null,
            remove,
          },
        },
        { provide: WishlistActions, useValue: { opening: signal(false), add: vi.fn() } },
        {
          provide: SettingsService,
          useValue: { getNotificationSettings: () => of({ wishlistAlerts: true }) },
        },
        { provide: WishlistService, useValue: { getWishlistAvailability: availability } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
        { provide: ToastService, useValue: { show: toast } },
        { provide: ShellLayout, useValue: { trackDock, measureDock } },
      ],
    });
    fixture = TestBed.createComponent(WishlistPaneComponent);
    fixture.componentRef.setInput('region', 'europe');
    fixture.componentRef.setInput('game', 'pokemon');
    fixture.componentRef.setInput('gameName', 'Pokémon');
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('asks "Available" for the browsed region and game (not the default ones)', () => {
    expect(availability).toHaveBeenCalledWith(
      { region: 'europe', game: 'pokemon' },
      'body',
      false,
      expect.anything(),
    );
    const rows = [...element.querySelectorAll('[data-testid="wish-row"]')];
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Pikachu, Any printing, None yet',
      'Eevee, Any printing, Available',
      'Mew, Any printing, None yet',
    ]);
  });

  it('reads "Available" once per set of wishes, not again when the same wishes are listed again (WD review F14)', async () => {
    expect(availability).toHaveBeenCalledTimes(1);
    items.set([...items()]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(availability).toHaveBeenCalledTimes(1);
    items.set(items().slice(1));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(availability).toHaveBeenCalledTimes(2);
  });

  it('confirms "for it" for one wish and "for them" for several', () => {
    expect(removeConfirmation(1).message).toBe('You stop getting alerts for it.');
    expect(removeConfirmation(3)).toEqual(
      expect.objectContaining({
        title: 'Remove 3 wishes?',
        message: 'You stop getting alerts for them.',
        confirmLabel: 'Remove from wishlist',
      }),
    );
  });

  it('keeps the wishes not removed selected, says so, and Try again removes them', async () => {
    element.querySelector<HTMLButtonElement>('.wp__select')!.click();
    fixture.detectChanges();
    for (const box of element.querySelectorAll<HTMLInputElement>('.wp__check')) {
      box.click();
    }
    fixture.detectChanges();
    // The toasts keep clear of the dock: the shell measures it (WD review U15 and R1-3).
    expect(trackDock).toHaveBeenLastCalledWith(element.querySelector('.wp__dock'));
    measureDock.mockClear();
    element.querySelector<HTMLButtonElement>('.wp__danger')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="wish-remove-error"]')).not.toBeNull();
    });
    // The error line made the dock taller and the list shorter: measured again after the render.
    expect(measureDock).toHaveBeenCalled();
    expect(element.querySelector('[data-testid="wish-remove-error"]')?.textContent).toContain(
      '2 wishes could not be removed.',
    );
    expect(toast).toHaveBeenCalledWith({ title: 'Removed from your wishlist' });
    expect(element.querySelector('.wp__dock')?.textContent).toContain('2 selected');
    // Select mode stays on with the two left.
    expect(element.querySelectorAll('.wp__check:checked')).toHaveLength(2);

    element.querySelector<HTMLButtonElement>('[data-testid="wish-remove-error"] button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('.wp__dock')).toBeNull();
    });
    expect(toast).toHaveBeenLastCalledWith({ title: '2 wishes removed' });
    expect(items()).toEqual([]);
    expect(trackDock).toHaveBeenLastCalledWith(null);
  });
});
