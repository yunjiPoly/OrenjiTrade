import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminListingItem } from '@orenji/api-client';
import { AdminListingRowsComponent, ListingRow } from './admin-listing-rows.component';

function row(item: Partial<AdminListingItem>): ListingRow {
  return {
    item: {
      id: 'item-1',
      cardId: 'card-1',
      cardName: 'Blue-Eyes White Dragon',
      printingId: 'printing-1',
      printingCode: 'LOB-EN001',
      imageUrl: 'http://localhost:8080/api/v1/public/card-images/img-1',
      game: 'yugioh',
      binderId: null,
      binderName: null,
      quantity: 1,
      condition: 'NEAR_MINT',
      availability: 'TRADE',
      askingPrice: null,
      currency: 'CAD',
      visibility: 'PUBLIC',
      publicUntil: null,
      effectivePublic: true,
      ...item,
    } as AdminListingItem,
    owner: { id: 'owner-1', handle: 'collector1' },
    confirmedAt: '2026-10-01T10:00:00Z',
    state: 'STALE',
    warnedAt: null,
  };
}

describe('AdminListingRowsComponent', () => {
  async function render(rows: ListingRow[]): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AdminListingRowsComponent);
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows each listing with the card picture the API sent', async () => {
    const element = await render([row({})]);
    const picture = element.querySelector('[data-testid="admin-listing-image"]');
    const image = picture?.querySelector('img');
    expect(image?.getAttribute('src')).toBe(
      'http://localhost:8080/api/v1/public/card-images/img-1',
    );
    expect(image?.getAttribute('alt')).toBe('Blue-Eyes White Dragon');
    expect(element.querySelector('.row__name')?.textContent).toContain('LOB-EN001');
  });

  it("falls back to the game's placeholder art without a picture", async () => {
    const element = await render([row({ imageUrl: null })]);
    const picture = element.querySelector('[data-testid="admin-listing-image"]');
    expect(picture?.getAttribute('data-state')).toBe('placeholder');
    expect(picture?.querySelector('img')).toBeNull();
    expect(
      picture?.querySelector('[data-testid="card-image-fallback"]')?.getAttribute('aria-label'),
    ).toBe('Blue-Eyes White Dragon');
  });
});
