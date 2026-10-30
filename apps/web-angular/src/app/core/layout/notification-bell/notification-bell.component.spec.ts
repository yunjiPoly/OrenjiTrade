import { MatTooltip } from '@angular/material/tooltip';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import {
  BindersService,
  NotificationResponse,
  NotificationResponseTypeEnum as Type,
} from '@orenji/api-client';
import { of } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import { NotificationCenter, RecentStatus } from '../../notifications/notification-center.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NotificationBellComponent } from './notification-bell.component';

function notification(id: string, readAt: string | null = null): NotificationResponse {
  return {
    id,
    type: Type.WishlistAlert,
    title: `Wishlist alert: Card ${id}`,
    body: `Card ${id} was listed by @collector5 in California, United States.`,
    data: { deepLink: `/cards/c-${id}` },
    createdAt: new Date().toISOString(),
    readAt,
  };
}

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let element: HTMLElement;
  const unreadCount = signal(0);
  const active = signal(true);
  const recent = signal<NotificationResponse[] | null>(null);
  const recentStatus = signal<RecentStatus>('idle');
  const lastPush = signal<NotificationResponse | null>(null);
  let center: Record<string, unknown>;
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    unreadCount.set(0);
    active.set(true);
    recent.set(null);
    recentStatus.set('idle');
    lastPush.set(null);
    center = {
      unreadCount,
      active,
      recent,
      recentStatus,
      lastPush,
      loadRecent: vi.fn(async () => {
        recent.set([notification('a'), notification('b', 'yesterday')]);
        recentStatus.set('ready');
      }),
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => 2),
    };
    snackBar = { open: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationCenter, useValue: center },
        { provide: RealtimeService, useValue: { state: signal('connected') } },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: BindersService, useValue: { listMyBinders: () => of([]) } },
        { provide: SessionService, useValue: { handle: signal('me') } },
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => true, user: signal({ uid: 'u1' }) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationBellComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  function bell(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="notification-bell"]')!;
  }

  it('shows an orange dot when unread and names the count in the label (spec 4.3)', async () => {
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(bell().getAttribute('data-realtime')).toBe('connected');
    expect(element.querySelector('[data-testid="notification-badge"]')).toBeNull();

    unreadCount.set(3);
    await fixture.whenStable();
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 3 new');
    const dot = element.querySelector('[data-testid="notification-badge"]');
    expect(dot).not.toBeNull();
    // A dot, never a number: the count is in the name only.
    expect(dot?.textContent?.trim()).toBe('');
    expect(dot?.getAttribute('aria-hidden')).toBe('true');

    unreadCount.set(140);
    await fixture.whenStable();
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 140 new');
  });

  it('announces pushed notifications to screen readers', async () => {
    lastPush.set(notification('z'));
    await fixture.whenStable();
    expect(element.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'New notification: Wishlist alert: Card z',
    );
    // An old offer notice is announced as history, never as a new offer (decision 2).
    lastPush.set({
      ...notification('o'),
      type: Type.OfferReceived,
      title: 'New offer on Card o',
      data: { offerId: 'o-1', cardName: 'Card o' },
    });
    await fixture.whenStable();
    expect(element.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'New notification: Past offer on Card o',
    );
  });

  it('hides the count while signed out', async () => {
    unreadCount.set(4);
    active.set(false);
    await fixture.whenStable();
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
  });

  async function openPopover(): Promise<HTMLElement> {
    bell().click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="notification-popover"]')).not.toBeNull();
    });
    await fixture.whenStable();
    TestBed.tick();
    return document.querySelector<HTMLElement>('[data-testid="notification-popover"]')!;
  }

  it('opens the popover of board W24: New and Earlier, a row opens its target and closes it', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const popover = await openPopover();
    expect(center['loadRecent']).toHaveBeenCalled();
    expect(bell().getAttribute('aria-expanded')).toBe('true');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(popover.querySelectorAll('[data-testid="notification-row"]')).toHaveLength(2);
    });
    const labels = [...popover.querySelectorAll('h3')].map((h) => h.textContent?.trim());
    expect(labels).toEqual(['New', 'Earlier']);
    expect(popover.textContent).toContain('See all notifications');
    const link = popover.querySelector<HTMLAnchorElement>('.nr__link')!;
    link.click();
    expect(center['markRead']).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="notification-popover"]')).toBeNull();
    });
    expect(navigate).toHaveBeenCalled();
  });

  it('its tooltip stays hidden while the popover is open (WE review U19)', async () => {
    const tooltip = fixture.debugElement
      .query((debug) => debug.attributes['data-testid'] === 'notification-bell')
      .injector.get(MatTooltip);
    expect(tooltip.disabled).toBe(false);
    await openPopover();
    TestBed.tick();
    expect(tooltip.disabled).toBe(true);
  });

  it('marks everything read from the popover', async () => {
    unreadCount.set(1);
    const popover = await openPopover();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(popover.querySelector('[data-testid="bell-mark-all"]')).not.toBeNull();
    });
    popover.querySelector<HTMLButtonElement>('[data-testid="bell-mark-all"]')!.click();
    await vi.waitFor(() => expect(center['markAllRead']).toHaveBeenCalled());
    bell().click();
  });

  it('the open popover takes the focus and keeps Tab inside it; Esc gives it back (F1, A2)', async () => {
    unreadCount.set(1);
    bell().focus();
    const popover = await openPopover();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(popover.querySelector('[data-testid="bell-mark-all"]')).not.toBeNull();
    });
    // The dialog itself is focused (a modal dialog named "Notifications").
    await vi.waitFor(() => expect(document.activeElement).toBe(popover));
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(popover.getAttribute('aria-modal')).toBe('true');
    // No page landmarks inside it (A7): no header or footer elements.
    expect(popover.querySelector('header, footer')).toBeNull();
    // The focus trap's two live anchors around the dialog wrap Tab inside it (the E2E presses Tab).
    const anchors = [...popover.parentElement!.children].filter((child) =>
      child.classList.contains('cdk-focus-trap-anchor'),
    );
    expect(anchors.map((anchor) => anchor.getAttribute('tabindex'))).toEqual(['0', '0']);
    expect(anchors[0].nextElementSibling).toBe(popover);
    // Esc closes it and the bell has the focus again.
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="notification-popover"]')).toBeNull(),
    );
    expect(document.activeElement).toBe(bell());
  });

  it('Mark all as read keeps the focus once nothing is unread (aria-disabled, A4)', async () => {
    unreadCount.set(1);
    (center['markAllRead'] as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      unreadCount.set(0);
      return 1;
    });
    const popover = await openPopover();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(popover.querySelector('[data-testid="bell-mark-all"]')).not.toBeNull();
    });
    const mark = popover.querySelector<HTMLButtonElement>('[data-testid="bell-mark-all"]')!;
    mark.focus();
    mark.click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(mark.getAttribute('aria-disabled')).toBe('true');
    });
    expect(mark.disabled).toBe(false);
    expect(document.activeElement).toBe(mark);
    // Pressed again: nothing to mark, no second call.
    mark.click();
    expect(center['markAllRead']).toHaveBeenCalledTimes(1);
    bell().click();
  });
});
