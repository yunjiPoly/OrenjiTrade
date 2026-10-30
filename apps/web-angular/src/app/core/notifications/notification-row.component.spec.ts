import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationResponse, NotificationResponseTypeEnum as Type } from '@orenji/api-client';
import { SessionService } from '../auth/session.service';
import { NotificationRowComponent } from './notification-row.component';
import { ReminderAnswers } from './reminder-answers.service';

function notice(type: Type, data: Record<string, unknown> = {}): NotificationResponse {
  return {
    id: 'n1',
    type,
    title: 'Title',
    body: 'Body',
    data,
    createdAt: '2026-10-28T12:00:00Z',
    readAt: null,
  } as NotificationResponse;
}

describe('NotificationRowComponent (spec 12, board W24)', () => {
  let fixture: ComponentFixture<NotificationRowComponent>;
  let element: HTMLElement;
  let state: ReturnType<typeof vi.fn>;
  let confirm: ReturnType<typeof vi.fn>;

  function render(notification: NotificationResponse, page = false): void {
    state = vi.fn(() => 'pending');
    confirm = vi.fn(async () => true);
    TestBed.configureTestingModule({
      imports: [NotificationRowComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { handle: signal('sam_trades') } },
        {
          provide: ReminderAnswers,
          useValue: {
            state,
            confirm,
            confirming: signal(null),
            reviewLink: () => ({ path: ['/inventory'], query: { binder: 'b1' } }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(NotificationRowComponent);
    fixture.componentRef.setInput('notification', notification);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('now', new Date('2026-10-28T12:05:00Z'));
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  it('links a wishlist alert to its card, with the bold card name and an unread dot', () => {
    render(
      notice(Type.WishlistAlert, {
        cardName: 'Maxx "C"',
        province: 'Quebec',
        collectorHandle: 'maya_k',
        deepLink: '/cards/c1?printing=p1',
      }),
    );
    const link = element.querySelector('a.nr__link')!;
    expect(link.getAttribute('href')).toBe('/cards/c1?printing=p1');
    expect(link.querySelector('strong')?.textContent).toBe('Maxx "C"');
    expect(link.textContent).toContain('from your wishlist was listed in Quebec');
    expect(element.querySelector('[data-testid="notification-unread-dot"]')).not.toBeNull();
    expect(element.querySelector('.nr__tile')?.getAttribute('data-tone')).toBe('wish');
  });

  it('answers a reminder in place: Still have them confirms, Review the binder opens it', () => {
    render(
      notice(Type.BinderStaleWarning, { binderId: 'b1', binderName: 'Trade binder', itemCount: 8 }),
    );
    expect(element.querySelector('a.nr__link')).toBeNull();
    const still = [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Still have them'),
    )!;
    still.click();
    expect(confirm).toHaveBeenCalled();
    expect(element.querySelector('.nr__review')?.getAttribute('href')).toBe('/inventory?binder=b1');
    state.mockReturnValue('confirmed');
    fixture.componentRef.setInput('notification', {
      ...notice(Type.BinderStaleWarning, { binderId: 'b1' }),
    });
    fixture.detectChanges();
    expect(element.textContent).toContain('Confirmed. They stay in search.');
  });

  it('reads an old offer as history that opens nothing', () => {
    render(notice(Type.OfferAccepted, { cardName: 'Ash Blossom', deepLink: '/offers/1' }), true);
    expect(element.querySelector('a.nr__link')).toBeNull();
    const history = element.querySelector('[data-testid="notification-history"]')!;
    expect(history.textContent).toContain('Past offer on Ash Blossom');
  });

  it("the page's unread row can be marked read", () => {
    render(notice(Type.RatingReceived, { raterHandle: 'maya_k', overall: 5 }), true);
    const read: string[] = [];
    fixture.componentInstance.markRead.subscribe((n) => read.push(n.id));
    element.querySelector<HTMLButtonElement>('.nr__read')!.click();
    expect(read).toEqual(['n1']);
    expect(element.querySelector('a.nr__link')?.getAttribute('href')).toBe(
      '/collectors/sam_trades?tab=ratings',
    );
  });
});
