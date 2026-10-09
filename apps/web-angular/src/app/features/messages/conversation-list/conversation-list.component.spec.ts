import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ConversationParticipantOnlineStatusEnum as Online,
  ConversationSummary,
  LastMessageKindEnum,
} from '@orenji/api-client';
import { ConversationListComponent } from './conversation-list.component';

function conversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    other: {
      id: `u-${id}`,
      handle: id,
      displayName: `Collector ${id}`,
      onlineStatus: Online.Hidden,
    },
    lastMessage: {
      id: `m-${id}`,
      preview: `Last of ${id}`,
      kind: LastMessageKindEnum.Text,
      createdAt: '2026-09-30T10:00:00Z',
      senderId: `u-${id}`,
    },
    unreadCount: 0,
    muted: false,
    archived: false,
    createdAt: '2026-09-29T10:00:00Z',
    ...overrides,
  };
}

describe('ConversationListComponent', () => {
  let fixture: ComponentFixture<ConversationListComponent>;
  let element: HTMLElement;
  let selected: string[];

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLButtonElement[] {
    return [...element.querySelectorAll<HTMLButtonElement>('button.row')];
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(ConversationListComponent);
    selected = [];
    fixture.componentInstance.selected.subscribe((id) => selected.push(id));
  });

  it('shows a skeleton, then an empty state', async () => {
    await render({ conversations: [], status: 'loading' });
    expect(element.querySelector('[aria-busy=true]')).not.toBeNull();
    await render({ status: 'ready' });
    expect(element.textContent).toContain('No conversations yet');
    // ADR 0017: collectors are found through search and their profile, never on the map.
    expect(element.textContent).toContain(
      "Find a card or a binder in search, open the collector's profile and press Message",
    );
    expect(element.textContent).not.toMatch(/map|preview|near/i);
  });

  it('lists conversations with unread badges, online dots and own previews', async () => {
    await render({
      status: 'ready',
      selfId: 'me',
      activeId: 'b',
      conversations: [
        conversation('a', {
          unreadCount: 3,
          other: { ...conversation('a').other, onlineStatus: Online.Online },
        }),
        conversation('b', {
          muted: true,
          lastMessage: { ...conversation('b').lastMessage!, preview: 'Deal', senderId: 'me' },
        }),
        conversation('c', { unreadCount: 120 }),
      ],
    });
    const [a, b, c] = rows();
    expect(a.querySelector('[data-testid=unread-badge]')?.textContent?.trim()).toBe('3');
    expect(a.getAttribute('aria-label')).toBe(
      'Conversation with Collector a, online, 3 unread messages, Last of a',
    );
    expect(a.querySelector('.row__online')).not.toBeNull();
    expect(b.getAttribute('aria-current')).toBe('true');
    expect(b.textContent).toContain('You: Deal');
    expect(b.getAttribute('aria-label')).toContain('muted');
    expect(c.querySelector('[data-testid=unread-badge]')?.textContent?.trim()).toBe('99+');
    b.click();
    expect(selected).toEqual(['b']);
  });

  it('moves between rows with the arrow keys, Home and End', async () => {
    await render({
      status: 'ready',
      conversations: [conversation('a'), conversation('b'), conversation('c')],
    });
    const [a, b, c] = rows();
    a.focus();
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(b);
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(c);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(c);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(a);
  });

  it('offers a retry when the inbox fails', async () => {
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);
    await render({ conversations: [], status: 'error' });
    const retry = [...element.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('Retry'),
    );
    retry?.click();
    expect(retries).toBe(1);
  });
});
