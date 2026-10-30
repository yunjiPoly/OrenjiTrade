import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { GameContext } from '../../core/game/game-context.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { RegionContext } from '../../core/region/region-context.service';
import { UnreadChats } from '../../core/layout/unread-chats/unread-chats';
import { CommunityViewComponent } from '../community/community-view.component';
import { MessagesPageComponent } from './messages-page.component';
import { MessengerComponent } from './messenger/messenger.component';
import { RealtimeStatusComponent } from './realtime-status/realtime-status.component';

@Component({ selector: 'app-messenger', template: '<ng-content select="[inboxHeader]" />' })
class FakeMessenger {
  readonly split = input(false);
  readonly conversationId = input<string | null>(null);
  readonly focusChat = input<string | null>(null);
  readonly chatFocused = output<void>();
  readonly openedChange = output<string | null>();
}

@Component({ selector: 'app-community-view', template: '<ng-content select="[inboxHeader]" />' })
class FakeCommunity {
  readonly split = input(false);
  readonly slug = input<string | null>(null);
}

@Component({ selector: 'app-realtime-status', template: '' })
class FakeRealtime {}

describe('MessagesPageComponent (spec 10, 10.7; Chats | Community)', () => {
  let fixture: ComponentFixture<MessagesPageComponent>;
  const narrow = signal(false);
  const setChatOpen = vi.fn();

  function render(inputs: { id?: string; tab?: string; room?: string }): void {
    TestBed.configureTestingModule({
      imports: [MessagesPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
        { provide: FeatureFlagsService, useValue: { enabled: () => signal(true) } },
        { provide: UnreadChats, useValue: { count: signal(0) } },
        { provide: RegionContext, useValue: { current: signal('americas-north') } },
        { provide: GameContext, useValue: { current: signal('yugioh') } },
        {
          provide: ShellLayout,
          useValue: { narrow, inChat: signal(false), tabTitle: signal(null), setChatOpen },
        },
      ],
    });
    TestBed.overrideComponent(MessagesPageComponent, {
      remove: { imports: [MessengerComponent, CommunityViewComponent, RealtimeStatusComponent] },
      add: { imports: [FakeMessenger, FakeCommunity, FakeRealtime] },
    });
    fixture = TestBed.createComponent(MessagesPageComponent);
    set(inputs);
  }

  function set(inputs: { id?: string; tab?: string; room?: string }): void {
    fixture.componentRef.setInput('id', inputs.id);
    fixture.componentRef.setInput('tab', inputs.tab);
    fixture.componentRef.setInput('room', inputs.room);
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    narrow.set(false);
    setChatOpen.mockClear();
  });

  it('below 960 a room opens above the tabs, as a chat does (no tab bar; WF review M27)', () => {
    narrow.set(true);
    render({ tab: 'community' });
    expect(setChatOpen).toHaveBeenLastCalledWith(false);
    set({ room: 'americas-north-yugioh' });
    expect(setChatOpen).toHaveBeenLastCalledWith(true);
    set({ tab: 'community' });
    expect(setChatOpen).toHaveBeenLastCalledWith(false);
    set({ id: 'conv-1' });
    expect(setChatOpen).toHaveBeenLastCalledWith(true);
  });

  it('switching Chats | Community keeps the focus on the tab now active (WF review U8)', async () => {
    render({});
    (document.activeElement as HTMLElement | null)?.blur();
    set({ room: 'americas-north-yugioh' });
    await settle();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('tab-link-community');
    (document.activeElement as HTMLElement | null)?.blur();
    set({});
    await settle();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('tab-link-chats');
  });

  it('"Message {h}" from a room asks the chat to take the focus once it opens (WF review A2)', async () => {
    render({ room: 'americas-north-yugioh' });
    set({ id: 'conv-9' });
    await settle();
    const messenger = fixture.debugElement.children
      .map((child) => child.componentInstance)
      .find((instance): instance is FakeMessenger => instance instanceof FakeMessenger)!;
    expect(messenger.focusChat()).toBe('conv-9');
    messenger.chatFocused.emit();
    fixture.detectChanges();
    expect(messenger.focusChat()).toBeNull();
  });
});
