import { TestBed } from '@angular/core/testing';
import type { NotificationResponse } from '@orenji/api-client';
import { NotificationEntryComponent } from './notification-entry.component';

function notification(data: Record<string, unknown>): NotificationResponse {
  return {
    id: 'n-1',
    type: 'WISHLIST_MATCH',
    title: 'Wishlist match: Azure-Eyes Sky Dragon',
    body: 'Azure-Eyes Sky Dragon AZR-EN001 was listed ~4 km away.',
    data,
    createdAt: '2026-10-01T10:00:00Z',
    readAt: null,
  } as NotificationResponse;
}

describe('NotificationEntryComponent', () => {
  async function render(data: Record<string, unknown>): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(NotificationEntryComponent);
    fixture.componentRef.setInput('notification', notification(data));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the card picture when the payload carries one, with the type as a badge', async () => {
    const element = await render({
      cardImageUrl: 'http://localhost:8080/api/v1/public/card-images/img-1',
      cardName: 'Azure-Eyes Sky Dragon',
      game: 'yugioh',
    });
    const card = element.querySelector('[data-testid="notification-card-image"]');
    expect(card).not.toBeNull();
    const image = card?.querySelector('img');
    expect(image?.getAttribute('src')).toBe(
      'http://localhost:8080/api/v1/public/card-images/img-1',
    );
    expect(image?.getAttribute('alt')).toBe('Azure-Eyes Sky Dragon');
    expect(card?.querySelector('.ne__badge mat-icon')?.textContent).toContain('favorite');
    expect(element.querySelector('.ne__icon')).toBeNull();
  });

  it('keeps the type icon when the payload carries no card picture', async () => {
    const element = await render({ wishlistItemId: 'w-1', game: 'yugioh' });
    expect(element.querySelector('[data-testid="notification-card-image"]')).toBeNull();
    expect(element.querySelector('.ne__icon mat-icon')?.textContent).toContain('favorite');
    expect(element.textContent).toContain('Wishlist match: Azure-Eyes Sky Dragon');
  });
});
