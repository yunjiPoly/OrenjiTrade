import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../auth/session.service';
import { KeyboardShortcuts } from '../../keyboard/keyboard-shortcuts.service';
import { ShellArea, ShellLayout } from '../shell-layout.service';
import { TabBarComponent } from '../tab-bar/tab-bar.component';
import { UnreadChats } from '../unread-chats/unread-chats';
import { RailComponent } from './rail.component';

describe('the rail and the tab bar (spec 4.6 and 16)', () => {
  const area = signal<ShellArea | null>('home');
  const canAccessAdmin = signal(false);
  const helpOpen = signal(false);
  let openHelp: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    area.set('home');
    canAccessAdmin.set(false);
    openHelp = vi.fn();
    await TestBed.configureTestingModule({
      imports: [RailComponent, TabBarComponent],
      providers: [
        provideRouter([]),
        { provide: ShellLayout, useValue: { area } },
        { provide: SessionService, useValue: { canAccessAdmin } },
        { provide: KeyboardShortcuts, useValue: { helpOpen, openHelp } },
      ],
    }).compileComponents();
  });

  function render<T>(type: Type<T>): { fixture: ComponentFixture<T>; el: HTMLElement } {
    const fixture = TestBed.createComponent(type);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists the five areas in the phone’s order and marks the active one', async () => {
    const { fixture, el } = render(RailComponent);
    const items = Array.from(el.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a'));
    expect(items.map((a) => a.textContent?.trim())).toEqual([
      'Home',
      'Search',
      'Inventory',
      'Messages',
      'Profile',
    ]);
    expect(items.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/search',
      '/inventory',
      '/messages',
      '/profile',
    ]);
    expect(items[0].getAttribute('aria-current')).toBe('page');
    expect(items.filter((a) => a.hasAttribute('aria-current'))).toHaveLength(1);
    area.set('inventory');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(items[2].getAttribute('aria-current')).toBe('page');
    expect(items[0].hasAttribute('aria-current')).toBe(false);
  });

  it('badges Messages with unread chats only, named in its label', async () => {
    const { fixture, el } = render(RailComponent);
    expect(el.querySelector('[data-testid="messages-badge"]')).toBeNull();
    TestBed.inject(UnreadChats).set(3);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="messages-badge"]')?.textContent?.trim()).toBe('3');
    expect(el.querySelector('[data-testid="rail-messages"]')?.getAttribute('aria-label')).toBe(
      'Messages, 3 unread chats',
    );
  });

  it('offers Admin to staff only, and the "?" button opens Keyboard shortcuts', async () => {
    const { fixture, el } = render(RailComponent);
    expect(el.querySelector('[data-testid="rail-admin"]')).toBeNull();
    canAccessAdmin.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="rail-admin"]')?.getAttribute('href')).toBe('/admin');
    const help = el.querySelector<HTMLButtonElement>('[data-testid="rail-help"]')!;
    expect(help.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    help.click();
    expect(openHelp).toHaveBeenCalled();
  });

  it('gives the narrow tab bar the same five tabs and badge', async () => {
    const { fixture, el } = render(TabBarComponent);
    TestBed.inject(UnreadChats).set(120);
    area.set('messages');
    fixture.detectChanges();
    await fixture.whenStable();
    const tabs = Array.from(el.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a'));
    expect(tabs.map((a) => a.textContent?.replace(/\d+\+?/g, '').trim())).toEqual([
      'Home',
      'Search',
      'Inventory',
      'Messages',
      'Profile',
    ]);
    expect(tabs[3].getAttribute('aria-current')).toBe('page');
    expect(tabs[3].textContent).toContain('99+');
    expect(tabs[3].getAttribute('aria-label')).toBe('Messages, 120 unread chats');
  });
});
