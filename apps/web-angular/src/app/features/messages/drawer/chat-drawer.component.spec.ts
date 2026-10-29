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
