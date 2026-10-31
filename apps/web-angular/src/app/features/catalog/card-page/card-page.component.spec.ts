import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideRouter } from '@angular/router';
import { CatalogService, WishlistService } from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  fakeGuestActions,
  provideFakeGuestActions,
} from '../../../core/guest/testing/fake-guest-actions';
import { ToastService } from '../../../core/feedback/toast.service';
import { GameContext } from '../../../core/game/game-context.service';
import { Popovers } from '../../../core/layout/popover/popover.service';
import { RegionContext } from '../../../core/region/region-context.service';
import { ViewerPlaceService } from '../../../shared/discovery/viewer-place.service';
import { RegionsStore } from '../../../shared/regions/regions.store';
import { WishlistActions } from '../../../shared/wishlist/wishlist-actions.service';
import { CardPageComponent } from './card-page.component';

const CARD = {
  id: 'card-pika',
  game: 'pokemon',
  name: 'Pikachu',
  printings: [{ id: 'p1', printingCode: 'SVI-025', setName: 'Scarlet & Violet', rarity: 'Common' }],
};

/** Who has this card (spec 7): the page's own behaviour, children left out. */
describe('CardPageComponent', () => {
  let fixture: ComponentFixture<CardPageComponent>;
  let element: HTMLElement;
  let select: ReturnType<typeof vi.fn>;
  let listWishlist: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;
  let wishlist$: Subject<unknown[]>;
  let guest: ReturnType<typeof fakeGuestActions>;

  async function render(options: { failWishlist?: boolean } = {}) {
    select = vi.fn(() => true);
    wishlist$ = new Subject<unknown[]>();
    listWishlist = vi.fn(() =>
      options.failWishlist ? throwError(() => new Error('offline')) : wishlist$,
    );
    open = vi.fn(() => ({ closed$: new Subject<void>() }));
    guest = fakeGuestActions(vi.fn);
    TestBed.configureTestingModule({
      imports: [CardPageComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: { getCard: () => of(CARD) } },
        { provide: WishlistService, useValue: { listWishlist, createWishlistItem: vi.fn() } },
        {
          provide: GameContext,
          useValue: { select, canBrowse: (slug: string) => slug === 'pokemon' },
        },
        { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
        provideFakeGuestActions(guest),
        { provide: Popovers, useValue: { open } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: LiveAnnouncer, useValue: { announce: vi.fn() } },
        {
          provide: RegionContext,
          useValue: { current: signal('americas-north'), select: vi.fn() },
        },
        {
          provide: RegionsStore,
          useValue: { load: vi.fn(), regionName: () => 'Americas (North)', country: () => null },
        },
        { provide: WishlistActions, useValue: { opening: signal(false), edit: vi.fn() } },
        {
          provide: ViewerPlaceService,
          useValue: { place: signal({ subdivisionCode: null, countryCode: null }) },
        },
      ],
    });
    TestBed.overrideComponent(CardPageComponent, {
      set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(CardPageComponent);
    fixture.componentRef.setInput('id', 'card-pika');
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function toggle(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="card-wish-toggle"]')!;
  }

  it('a Pokémon card makes Pokémon the browsed game (spec 4.2)', async () => {
    await render();
    expect(select).toHaveBeenCalledWith('pokemon');
  });

  it('keeps the wishlist toggle disabled until the wishlist answered, then says what it is', async () => {
    await render();
    expect(toggle().disabled).toBe(true);
    expect(toggle().getAttribute('aria-busy')).toBe('true');
    wishlist$.next([{ id: 'w1', card: { id: 'card-pika' } }]);
    wishlist$.complete();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(toggle().disabled).toBe(false);
    expect(toggle().textContent).toContain('On your wishlist');
    // Once on, a click opens Edit wish (a dialog), not a pressed state.
    expect(toggle().getAttribute('aria-haspopup')).toBe('dialog');
    expect(toggle().hasAttribute('aria-pressed')).toBe(false);
  });

  it('after a failed wishlist read, a click reads it again before adding anything', async () => {
    await render({ failWishlist: true });
    expect(toggle().disabled).toBe(false);
    toggle().click();
    await fixture.whenStable();
    expect(listWishlist).toHaveBeenCalledTimes(2);
    const create = TestBed.inject(WishlistService).createWishlistItem as ReturnType<typeof vi.fn>;
    expect(create).not.toHaveBeenCalled();
  });

  it('opens one printing popover at a time', async () => {
    await render();
    const pill = element.querySelector<HTMLButtonElement>('[data-testid="printing-pill"]')!;
    pill.click();
    pill.click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    pill.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
