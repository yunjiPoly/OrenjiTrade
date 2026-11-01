import { Component, NO_ERRORS_SCHEMA, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ConversationParticipantOnlineStatusEnum as Online,
  type ConversationSummary,
} from '@orenji/api-client';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ChatDrawer } from '../../../shared/messaging/chat-drawer.service';
import { ThreadViewComponent } from '../thread/thread-view.component';
import { ChatDrawerComponent } from './chat-drawer.component';

const CHAT: ConversationSummary = {
  id: 'c1',
  other: { id: 'u2', handle: 'theo.duels', displayName: 'Theo', onlineStatus: Online.Hidden },
  unreadCount: 0,
  muted: false,
  archived: false,
  createdAt: '2026-10-20T10:00:00Z',
};

/** The chat itself has its own spec: a field stands in for its composer. */
@Component({
  selector: 'app-thread-view',
  template: `<ng-content select="[drawerHeader]" /><textarea aria-label="Message"></textarea>`,
})
class ThreadViewStub {
  readonly conversation = input<ConversationSummary>();
  readonly mode = input<string>();
  readonly showBack = input(true);
  readonly back = output<void>();
  readonly updated = output<ConversationSummary>();
}

/**
 * The chat drawer's keys (spec 10.6, WC review R1-1): Esc inside closes it with the focus back on
 * the opener; at md, where it overlays the page, Esc on the page closes it too and leaves the
 * focus on the page control (a control under the drawer shows again), after a menu, a dialog or
 * a text field's own Esc; at lg and xl, where it pushes the page, Esc on the page leaves it open.
 */
describe('ChatDrawerComponent (web WC, spec 10.6)', () => {
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let close: ReturnType<typeof vi.fn>;
  let page: HTMLElement;
  let opener: HTMLButtonElement;
  const medium = signal(true);

  beforeEach(async () => {
    medium.set(true);
    close = vi.fn();
    page = document.createElement('div');
    page.innerHTML = `
      <button id="opener">Message theo.duels</button>
      <input id="field" aria-label="Search" />
      <div class="cdk-overlay-container"></div>`;
    document.body.append(page);
    opener = page.querySelector('#opener')!;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ShellLayout, useValue: { medium } },
        {
          provide: ChatDrawer,
          useValue: {
            state: signal({ conversation: CHAT, opener }),
            close,
            update: vi.fn(),
          },
        },
      ],
    });
    TestBed.overrideComponent(ChatDrawerComponent, {
      remove: { imports: [ThreadViewComponent] },
      add: { imports: [ThreadViewStub], schemas: [NO_ERRORS_SCHEMA] },
    });
    fixture = TestBed.createComponent(ChatDrawerComponent);
    fixture.componentRef.setInput('conversation', CHAT);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    page.remove();
  });

  /** Presses Esc on `target`, as the browser does (capture, target, bubble to the window). */
  function escape(target: Element): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  function drawerField(): HTMLTextAreaElement {
    return (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
  }

  it('"I have it" without a copy of yours: a line over the earlier pinned card (WE review F7)', async () => {
    const pinned = { ...CHAT, subject: { itemId: 'old' } } as unknown as ConversationSummary;
    const state = TestBed.inject(ChatDrawer).state as unknown as ReturnType<typeof signal>;
    state.set({ conversation: pinned, opener, context: 'About their wish: Ash Blossom.' });
    fixture.componentRef.setInput('conversation', pinned);
    await fixture.whenStable();
    const line = () =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="chat-drawer-context"]');
    expect(line()?.textContent?.trim()).toBe('About their wish: Ash Blossom.');
    // A chat without a pinned card has nothing to explain.
    state.set({ conversation: CHAT, opener, context: 'About their wish: Ash Blossom.' });
    fixture.componentRef.setInput('conversation', CHAT);
    await fixture.whenStable();
    expect(line()).toBeNull();
  });

  it('closes on Esc inside, the focus going back to the opener', () => {
    escape(drawerField());
    expect(close).toHaveBeenCalledWith();
  });

  it('at md closes on Esc on the page before the page acts, leaving the focus there (R1-1)', () => {
    const pageEscape = vi.fn();
    opener.addEventListener('keydown', pageEscape);
    opener.focus();
    const event = escape(opener);
    expect(close).toHaveBeenCalledWith(false);
    // The drawer is the top overlay: the page's own Esc (clear the selection) waits for the next.
    expect(event.defaultPrevented).toBe(true);
    expect(pageEscape).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it('at md lets a text field use its Esc first, and closes when the field left it unused', () => {
    const field = page.querySelector<HTMLInputElement>('#field')!;
    const clears = (event: Event) => event.preventDefault();
    field.addEventListener('keydown', clears);
    escape(field);
    expect(close).not.toHaveBeenCalled();
    field.removeEventListener('keydown', clears);
    escape(field);
    expect(close).toHaveBeenCalledWith(false);
  });

  it('at md leaves Esc to a search field the browser clears, and closes once it is empty (R2-1)', async () => {
    const search = document.createElement('input');
    search.type = 'search';
    search.setAttribute('aria-label', 'Search cards');
    page.append(search);
    const afterTasks = () => new Promise((resolve) => setTimeout(resolve));
    /** Esc as the browser presses it on a search field: every handler, then its own clear. */
    const escapeAndClear = () => {
      const event = escape(search);
      if (!event.defaultPrevented) {
        search.value = '';
      }
      return event;
    };

    search.value = 'Lantern';
    const first = escapeAndClear();
    await afterTasks();
    expect(first.defaultPrevented).toBe(false);
    expect(search.value).toBe('');
    expect(close).not.toHaveBeenCalled();

    // An engine that leaves the text as it is: the field left that Esc unused.
    search.value = 'Lantern';
    escape(search);
    expect(close).not.toHaveBeenCalled();
    await afterTasks();
    expect(close).toHaveBeenCalledWith(false);

    // An empty search field leaves Esc unused: the drawer closes at once.
    close.mockClear();
    search.value = '';
    escapeAndClear();
    expect(close).toHaveBeenCalledWith(false);
  });

  it('at md closes after the Esc of a combobox that prevents every Esc, once its list is closed (V3-2)', async () => {
    const box = document.createElement('input');
    box.setAttribute('role', 'combobox');
    box.setAttribute('aria-expanded', 'true');
    box.value = 'Lant';
    page.append(box);
    const afterTasks = () => new Promise((resolve) => setTimeout(resolve));
    /** As Material's autocomplete does: every Esc prevented, and an open list closed by it. */
    const autocomplete = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        box.setAttribute('aria-expanded', 'false');
      }
    };
    box.addEventListener('keydown', autocomplete);

    // The first Esc closes the list: the drawer stays.
    escape(box);
    await afterTasks();
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(close).not.toHaveBeenCalled();

    // The next Esc changes nothing in the field: it was unused, the drawer closes.
    escape(box);
    expect(close).not.toHaveBeenCalled();
    await afterTasks();
    expect(close).toHaveBeenCalledWith(false);

    // An Esc that cleared the field (with its list closed) was the field's: the drawer stays.
    close.mockClear();
    const clears = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        box.value = '';
      }
    };
    box.value = 'Lant';
    box.addEventListener('keydown', clears);
    escape(box);
    await afterTasks();
    expect(close).not.toHaveBeenCalled();
    box.removeEventListener('keydown', clears);
    box.removeEventListener('keydown', autocomplete);
  });

  it('at md leaves Esc to a menu or a dialog on top, but not to a menu that is closing', () => {
    const container = page.querySelector('.cdk-overlay-container')!;
    container.innerHTML =
      '<div class="cdk-overlay-pane"><div class="mat-mdc-menu-panel"></div></div>';
    escape(opener);
    expect(close).not.toHaveBeenCalled();
    container.innerHTML = '<div class="cdk-overlay-pane"><div role="dialog"></div></div>';
    escape(opener);
    expect(close).not.toHaveBeenCalled();
    container.innerHTML =
      '<div class="cdk-overlay-pane"><div class="mat-mdc-menu-panel mat-menu-panel-exit-animation"></div></div>';
    escape(opener);
    expect(close).toHaveBeenCalledWith(false);
  });

  it('at lg and xl, where it pushes the page, leaves Esc on the page to the page', () => {
    medium.set(false);
    const event = escape(opener);
    expect(close).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('moves the focus between the page and the drawer with F6', () => {
    drawerField().focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', cancelable: true }));
    expect(document.activeElement).toBe(opener);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', cancelable: true }));
    expect(document.activeElement).toBe(drawerField());
  });
});
