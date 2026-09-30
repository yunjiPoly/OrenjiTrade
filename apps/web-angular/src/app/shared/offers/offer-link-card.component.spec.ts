import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageResponse } from '@orenji/api-client';
import { MessageBubbleComponent } from '../../features/messages/thread/message-bubble.component';

function message(overrides: Record<string, unknown>): MessageResponse {
  return {
    id: 'm-1',
    conversationId: 'c-1',
    senderId: null,
    kind: 'SYSTEM',
    body: 'Ben made an offer: 38.00 CAD for Lantern Fox Spirit.',
    payload: {
      offer: { id: 'offer-2', status: 'COUNTERED', summary: '42.00 CAD for Lantern Fox Spirit' },
    },
    createdAt: '2026-09-30T10:00:00Z',
    readByOther: false,
    moderationState: 'OK',
    ...overrides,
  } as MessageResponse;
}

describe('offer cards in the conversation', () => {
  async function render(value: MessageResponse): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MessageBubbleComponent);
    fixture.componentRef.setInput('message', value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the SYSTEM line with a card linking to the live proposal', async () => {
    const element = await render(message({}));
    expect(element.querySelector('[data-testid="system-message"]')?.textContent).toContain(
      'Ben made an offer',
    );
    const link = element.querySelector<HTMLAnchorElement>('[data-testid="offer-link-card"]');
    expect(link?.getAttribute('href')).toBe('/offers/offer-2');
    expect(link?.getAttribute('aria-label')).toBe(
      'Open the offer: 42.00 CAD for Lantern Fox Spirit, Countered',
    );
  });

  it('renders OFFER_LINK messages as the same card with the caption', async () => {
    const element = await render(
      message({ kind: 'OFFER_LINK', senderId: 'u-1', body: 'Here is my offer.' }),
    );
    expect(element.querySelector('[data-testid="offer-link-card"]')?.textContent).toContain(
      '42.00 CAD for Lantern Fox Spirit',
    );
    expect(element.textContent).toContain('Here is my offer.');
  });
});
