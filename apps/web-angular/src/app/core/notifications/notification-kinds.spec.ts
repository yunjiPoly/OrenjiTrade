import { NotificationResponseTypeEnum as Type } from '@orenji/api-client';
import { isUnread, notificationKind, notificationLink, safeAppPath } from './notification-kinds';

describe('notification kinds', () => {
  it('gives each type an icon, a tone and a label, with a neutral fallback', () => {
    expect(notificationKind({ type: Type.WishlistMatch, data: {} })).toEqual({
      icon: 'favorite',
      tone: 'match',
      label: 'Wishlist match',
    });
    expect(notificationKind({ type: Type.Message, data: {} }).tone).toBe('message');
    expect(notificationKind({ type: Type.BinderHidden, data: {} }).tone).toBe('warning');
    expect(notificationKind({ type: 'SOMETHING_NEW' as Type, data: {} })).toEqual({
      icon: 'notifications',
      tone: 'system',
      label: 'Notification',
    });
  });

  it('shows the plan-limit notice with the premium icon', () => {
    expect(notificationKind({ type: Type.System, data: { kind: 'LIMIT_REACHED' } })).toEqual({
      icon: 'workspace_premium',
      tone: 'system',
      label: 'Plan limit',
    });
  });

  it('follows only same-app paths', () => {
    expect(safeAppPath('/wishlist/00000000-0000-4000-8f00-000000000201')).toBe(
      '/wishlist/00000000-0000-4000-8f00-000000000201',
    );
    expect(safeAppPath('/inventory?binder=unfiled')).toBe('/inventory?binder=unfiled');
    expect(safeAppPath('//evil.example/phish')).toBeNull();
    expect(safeAppPath('https://evil.example')).toBeNull();
    expect(safeAppPath('/x" onclick="y')).toBeNull();
    expect(safeAppPath('javascript:alert(1)')).toBeNull();
    expect(safeAppPath(42)).toBeNull();
  });

  it('opens the deep link, else a page rebuilt from the ids, else the list', () => {
    expect(notificationLink({ type: Type.Message, data: { deepLink: '/messages/c1' } })).toBe(
      '/messages/c1',
    );
    expect(notificationLink({ type: Type.WishlistMatch, data: { wishlistItemId: 'w-1' } })).toBe(
      '/wishlist/w-1',
    );
    expect(notificationLink({ type: Type.WishlistMatch, data: {} })).toBe('/wishlist');
    expect(notificationLink({ type: Type.Message, data: { conversationId: 'c-9' } })).toBe(
      '/messages/c-9',
    );
    expect(notificationLink({ type: Type.BinderStaleWarning, data: { binderId: 'b-2' } })).toBe(
      '/inventory?binder=b-2',
    );
    expect(notificationLink({ type: Type.System, data: { kind: 'LIMIT_REACHED' } })).toBe(
      '/premium',
    );
    expect(
      notificationLink({
        type: Type.WishlistMatch,
        data: { deepLink: 'https://evil.example', wishlistItemId: '../../x' },
      }),
    ).toBe('/wishlist');
    expect(notificationLink({ type: Type.RatingReceived, data: {} })).toBe('/notifications');
  });

  it('knows unread notifications', () => {
    expect(isUnread({ readAt: null })).toBe(true);
    expect(isUnread({ readAt: '2026-09-30T10:00:00Z' })).toBe(false);
  });
});
