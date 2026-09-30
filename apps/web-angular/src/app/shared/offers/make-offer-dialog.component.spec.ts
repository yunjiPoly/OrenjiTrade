import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { InventoryItemResponse, InventoryService, OffersService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { MakeOfferDialogComponent, MakeOfferDialogData } from './make-offer-dialog.component';
import { offerTargetFromItem } from './offer-target';
import { offerResponse, publicItem } from './testing/offer-fixtures';

const SELLER = { id: 'seller-1', displayName: 'Ada Seller', placeLabel: 'Plateau-Mont-Royal' };

function ownCard(): InventoryItemResponse {
  return {
    ...publicItem({ id: 'mine-1', quantity: 3 }),
    card: { id: 'card-9', name: 'Thornwood Druid', game: 'mtg' },
    notes: '',
    visibility: 'PRIVATE',
    effectivePublic: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  } as unknown as InventoryItemResponse;
}

function conflict(status: number, errorCode: string, extra: Record<string, unknown> = {}) {
  return throwError(
    () =>
      new HttpErrorResponse({ status, error: { errorCode, status, message: errorCode, ...extra } }),
  );
}

describe('MakeOfferDialogComponent', () => {
  let fixture: ComponentFixture<MakeOfferDialogComponent>;
  let element: HTMLElement;
  let offers: Record<string, ReturnType<typeof vi.fn>>;
  let close: ReturnType<typeof vi.fn>;
  let protectedPayments: ReturnType<typeof signal<boolean>>;

  async function create(data: MakeOfferDialogData): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: FeatureFlagsService,
          useValue: {
            enabled: (key: string) =>
              key === 'protectedPayments' ? protectedPayments : signal(false),
          },
        },
        { provide: OffersService, useValue: offers },
        {
          provide: InventoryService,
          useValue: {
            listInventoryItems: vi.fn(() => of({ items: [ownCard()], totalItems: 1 })),
          },
        },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    fixture = TestBed.createComponent(MakeOfferDialogComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function button(label: string): HTMLButtonElement {
    const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
      candidate.textContent?.includes(label),
    );
    if (!found) {
      throw new Error(`No button "${label}"`);
    }
    return found;
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(() => {
    close = vi.fn();
    protectedPayments = signal(false);
    offers = {
      createOffer: vi.fn(() => of(offerResponse({ id: 'offer-new' }))),
      counterOffer: vi.fn(() => of(offerResponse({ id: 'offer-counter' }))),
    };
  });

  it('offers the kinds of a trade-or-sale card, validates and sends a cash offer once', async () => {
    await create({ target: offerTargetFromItem(publicItem(), SELLER) });
    expect(element.querySelector('h2')?.textContent).toContain('Make an offer');
    expect(element.textContent).toContain('Asking $45.00');
    const kinds = [...element.querySelectorAll('mat-button-toggle')].map((toggle) =>
      toggle.textContent?.replace(/payments|swap_horiz|add_card/g, '').trim(),
    );
    expect(kinds).toEqual(['Cash', 'Trade', 'Cash + cards']);

    await submit();
    expect(offers['createOffer']).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter the amount you offer.');

    await type('input[formcontrolname="cashAmount"]', '38');
    await type('textarea[formcontrolname="message"]', ' Library on Saturday? ');
    expect(element.querySelector('[data-testid="offer-summary"]')?.textContent).toContain(
      '$38.00 for Lantern Fox Spirit',
    );
    await submit();
    expect(offers['createOffer']).toHaveBeenCalledTimes(1);
    const [request] = offers['createOffer'].mock.calls[0];
    expect(request.createOfferRequest).toEqual({
      itemId: 'item-1',
      kind: 'CASH',
      cashAmount: 38,
      currency: 'CAD',
      message: 'Library on Saturday?',
      expiresInHours: 72,
    });
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(close).toHaveBeenCalledWith({ offer: expect.objectContaining({ id: 'offer-new' }) });
  });

  it('asks for payment protection on cash offers while the feature is on', async () => {
    protectedPayments.set(true);
    await create({ target: offerTargetFromItem(publicItem(), SELLER) });
    const option = element.querySelector('[data-testid="protection-option"]');
    expect(option?.textContent).toContain('Use payment protection');
    expect(option?.textContent).toContain('the payment provider holds the money');
    expect(element.textContent?.toLowerCase()).not.toContain('escrow');
    element.querySelector<HTMLInputElement>('[data-testid="protection-option"] input')?.click();
    await type('input[formcontrolname="cashAmount"]', '40');
    expect(element.querySelector('[data-testid="offer-summary"]')?.textContent).toContain(
      'with payment protection',
    );
    await submit();
    const [request] = offers['createOffer'].mock.calls[0];
    expect(request.createOfferRequest).toMatchObject({
      kind: 'CASH',
      cashAmount: 40,
      protectionRequested: true,
    });
    // Trade offers have no cash part: no protection option.
    button('Trade').click();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="protection-option"]')).toBeNull();
  });

  it('hides payment protection while the feature is off', async () => {
    await create({ target: offerTargetFromItem(publicItem(), SELLER) });
    expect(element.querySelector('[data-testid="protection-option"]')).toBeNull();
  });

  it('adds the buyer’s own cards with copies to a trade offer', async () => {
    await create({ target: offerTargetFromItem(publicItem(), SELLER) });
    button('Trade').click();
    await fixture.whenStable();
    button('Add').click();
    await fixture.whenStable();
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Increase quantity of Thornwood Druid"]')
      ?.click();
    await fixture.whenStable();
    await submit();
    const [request] = offers['createOffer'].mock.calls[0];
    expect(request.createOfferRequest).toMatchObject({
      kind: 'TRADE',
      tradeItemIds: [{ inventoryItemId: 'mine-1', quantity: 2 }],
    });
    expect(request.createOfferRequest.cashAmount).toBeUndefined();
  });

  it('links to the open offer on 409 and keeps the dialog open', async () => {
    offers['createOffer'].mockReturnValueOnce(
      conflict(409, 'OFFER_ALREADY_OPEN', { offerId: 'o-7' }),
    );
    await create({ target: offerTargetFromItem(publicItem(), SELLER) });
    await type('input[formcontrolname="cashAmount"]', '30');
    await submit();
    const problem = element.querySelector('[data-testid="offer-error"]');
    expect(problem?.textContent).toContain('You already have an open offer on this card');
    expect(problem?.querySelector('a')?.getAttribute('href')).toBe('/offers/o-7');
    expect(button('Send offer').disabled).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it('shows a single kind for a sale-only card', async () => {
    await create({
      target: offerTargetFromItem(publicItem({ availability: 'SALE' }), SELLER),
    });
    expect(element.querySelectorAll('mat-button-toggle')).toHaveLength(0);
    expect(element.textContent).toContain('this card is for sale');
  });

  it('counters with the version seen, refuses the same deal and hands conflicts to the page', async () => {
    const offer = offerResponse({ version: 2 });
    const data: MakeOfferDialogData = {
      target: offerTargetFromItem(publicItem(), SELLER),
      counter: { offer, viewerRole: 'SELLER', otherName: 'Ben Buyer' },
    };
    await create(data);
    expect(element.querySelector('h2')?.textContent).toContain('Counter-offer');
    expect(element.querySelector('[data-testid="current-proposal"]')?.textContent).toContain(
      '$38.00',
    );
    // The buyer offered no cards: a seller can only answer with cash.
    expect(element.querySelectorAll('mat-button-toggle')).toHaveLength(0);
    await submit();
    expect(offers['counterOffer']).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="offer-error"]')?.textContent).toContain(
      'A counter-offer must change the amount or the cards.',
    );

    offers['counterOffer'].mockReturnValueOnce(
      conflict(409, 'STALE_OFFER', { latestOfferId: 'offer-2' }),
    );
    await type('input[formcontrolname="cashAmount"]', '42');
    await submit();
    expect(offers['counterOffer']).toHaveBeenCalledWith(
      {
        id: 'offer-1',
        counterOfferRequest: {
          kind: 'CASH',
          cashAmount: 42,
          currency: 'CAD',
          tradeItemIds: [],
          expiresInHours: 72,
          version: 2,
        },
      },
      'body',
      false,
      expect.anything(),
    );
    expect(close).toHaveBeenCalledWith({
      problem: expect.objectContaining({ latestOfferId: 'offer-2', reload: true }),
    });
  });
});
