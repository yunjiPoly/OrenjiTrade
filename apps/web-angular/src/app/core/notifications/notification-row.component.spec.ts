import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationResponse, NotificationResponseTypeEnum as Type } from '@orenji/api-client';
import { SessionService } from '../auth/session.service';
import { NOTIFICATION_SURFACE, NotificationRowComponent } from './notification-row.component';
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

  it("Still have them in the bell moves the focus to the bell's own row, not the page's copy (R1-2)", async () => {
    // /notifications open under the bell: the same reminder is on the page (earlier in the DOM)
    // and in the popover's overlay; the answer given in the popover keeps the focus there.
    const answered = signal<'pending' | 'confirmed'>('pending');
    // The service's answer: the state is confirmed when its promise resolves.
    const answer = vi.fn(async () => {
      answered.set('confirmed');
      return true;
    });
    TestBed.configureTestingModule({
      imports: [NotificationRowComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { handle: signal('sam_trades') } },
        {
          provide: ReminderAnswers,
          useValue: {
            state: () => answered(),
            confirm: answer,
            confirming: signal(null),
            reviewLink: () => ({ path: ['/inventory'], query: { binder: 'b1' } }),
          },
        },
      ],
    });
    const reminder = notice(Type.BinderStaleWarning, {
      binderId: 'b1',
      binderName: 'Trade binder',
    });
    const main = document.createElement('main');
    const pageList = document.createElement('section');
    pageList.setAttribute('data-notification-surface', '');
    main.append(pageList);
    const popover = document.createElement('div');
    popover.setAttribute('data-notification-surface', '');
    document.body.append(main, popover);
    try {
      const rows = [true, false].map((page) => {
        const row = TestBed.createComponent(NotificationRowComponent);
        row.componentRef.setInput('notification', reminder);
        row.componentRef.setInput('page', page);
        row.autoDetectChanges();
        return row;
      });
      await Promise.all(rows.map((row) => row.whenStable()));
      // Moved once both exist (TestBed takes an earlier root out of the body on a new one).
      pageList.append(rows[0].nativeElement as HTMLElement);
      popover.append(rows[1].nativeElement as HTMLElement);
      expect(popover.matches(NOTIFICATION_SURFACE)).toBe(true);
      const still = [...(rows[1].nativeElement as HTMLElement).querySelectorAll('button')].find(
        (b) => b.textContent?.includes('Still have them'),
      )!;
      still.focus();
      still.click();
      await new Promise((resolve) => setTimeout(resolve));
      await Promise.all(rows.map((row) => row.whenStable()));
      expect(answer).toHaveBeenCalledTimes(1);
      expect(main.querySelector('.nr__confirmed')).not.toBeNull();
      const focused = document.activeElement as HTMLElement;
      expect(focused.classList.contains('nr__confirmed')).toBe(true);
      expect(popover.contains(focused)).toBe(true);
    } finally {
      main.remove();
      popover.remove();
    }
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
