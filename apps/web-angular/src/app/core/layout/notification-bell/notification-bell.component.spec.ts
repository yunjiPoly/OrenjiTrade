import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { NotificationResponse, NotificationResponseTypeEnum as Type } from '@orenji/api-client';
import { NotificationCenter, RecentStatus } from '../../notifications/notification-center.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NotificationBellComponent } from './notification-bell.component';

function notification(id: string, readAt: string | null = null): NotificationResponse {
  return {
    id,
    type: Type.WishlistAlert,
    title: `Wishlist alert: Card ${id}`,
    body: `Card ${id} was listed by @collector5 in California, United States.`,
    data: { deepLink: `/wishlist/w-${id}` },
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
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationBellComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  function bell(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="notification-bell"]')!;
  }

  it('shows the unread count as a badge and in the label', async () => {
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(bell().getAttribute('data-realtime')).toBe('connected');
    expect(element.querySelector('[data-testid="notification-badge"]')).toBeNull();

    unreadCount.set(3);
    await fixture.whenStable();
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 3 unread');
    expect(element.querySelector('[data-testid="notification-badge"]')?.textContent?.trim()).toBe(
      '3',
    );

    unreadCount.set(140);
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="notification-badge"]')?.textContent?.trim()).toBe(
      '99+',
    );
  });

  it('announces pushed notifications to screen readers', async () => {
    lastPush.set(notification('z'));
    await fixture.whenStable();
    expect(element.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'New notification: Wishlist alert: Card z',
    );
  });

  it('hides the count while signed out', async () => {
    unreadCount.set(4);
    active.set(false);
    await fixture.whenStable();
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
  });

  it('lists the latest notifications when opened; opening one marks it read and follows it', async () => {
    unreadCount.set(1);
    await fixture.whenStable();
    bell().click();
    await fixture.whenStable();
    expect(center['loadRecent']).toHaveBeenCalled();
    const items = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.notification-menu .nm__item'),
    );
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Wishlist alert: Card a'),
      expect.stringContaining('Wishlist alert: Card b'),
    ]);
    expect(items[0].querySelector('[data-testid="notification-unread-dot"]')).not.toBeNull();
    expect(items[1].querySelector('[data-testid="notification-unread-dot"]')).toBeNull();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    items[0].click();
    expect(center['markRead']).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(navigate).toHaveBeenCalledWith('/wishlist/w-a');
  });

  it('marks everything read from the menu', async () => {
    unreadCount.set(2);
    await fixture.whenStable();
    bell().click();
    await fixture.whenStable();
    const markAll = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Mark all as read'),
    );
    markAll!.click();
    await fixture.whenStable();
    expect(center['markAllRead']).toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith('2 notifications marked as read.', 'OK', {
      duration: 4000,
    });
  });
});
