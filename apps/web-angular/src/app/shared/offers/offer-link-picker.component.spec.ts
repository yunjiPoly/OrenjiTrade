import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OfferSummary, OffersService } from '@orenji/api-client';
import { of } from 'rxjs';
import { OfferLinkPickerComponent, offerChoices } from './offer-link-picker.component';
import { party, publicItem } from './testing/offer-fixtures';

function summary(id: string, counterpartyId: string, status = 'OPEN'): OfferSummary {
  return {
    id,
    rootOfferId: id,
    item: publicItem(),
    counterparty: party(counterpartyId, `Collector ${counterpartyId}`),
    viewerRole: 'BUYER',
    kind: 'MIXED',
    cashAmount: 20,
    currency: 'CAD',
    tradeItemCount: 1,
    status,
    currentTurn: 'SELLER',
    yourTurn: false,
    allowedActions: [],
    expiresAt: '2026-10-03T10:00:00Z',
    version: 0,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
  } as unknown as OfferSummary;
}

describe('OfferLinkPickerComponent', () => {
  it('keeps only the negotiations with the conversation partner', () => {
    expect(
      offerChoices(
        [summary('a', 'u-2'), summary('b', 'u-3'), summary('c', 'u-2', 'ACCEPTED')],
        'u-2',
      ),
    ).toEqual([
      {
        offerId: 'a',
        cardName: 'Lantern Fox Spirit',
        imageUrl: 'http://localhost/card.svg',
        game: 'yugioh',
        terms: '$20.00 + 1 card',
        status: 'OPEN',
      },
      {
        offerId: 'c',
        cardName: 'Lantern Fox Spirit',
        imageUrl: 'http://localhost/card.svg',
        game: 'yugioh',
        terms: '$20.00 + 1 card',
        status: 'ACCEPTED',
      },
    ]);
  });

  it('lists them as buttons and emits the chosen one', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OffersService,
          useValue: {
            listOffers: vi.fn(() => of({ items: [summary('a', 'u-2'), summary('b', 'u-3')] })),
          },
        },
      ],
    });
    const fixture: ComponentFixture<OfferLinkPickerComponent> =
      TestBed.createComponent(OfferLinkPickerComponent);
    fixture.componentRef.setInput('otherId', 'u-2');
    fixture.componentRef.setInput('otherName', 'Ada');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const choices = element.querySelectorAll<HTMLButtonElement>('.olp__choice');
    expect(choices).toHaveLength(1);
    let picked: string | null = null;
    fixture.componentInstance.picked.subscribe((choice) => (picked = choice.offerId));
    choices[0].click();
    expect(picked).toBe('a');
  });
});
