import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CommunityChannel } from '@orenji/api-client';
import { RegionPillComponent } from '../../../core/layout/region-pill/region-pill.component';
import { CommunityRoomsStore } from '../data/community-rooms.store';
import { fixtureRoom } from '../testing/community-fixtures';
import { RoomListComponent } from './room-list.component';

@Component({ selector: 'app-region-pill', template: '<button>Americas (North)</button>' })
class FakeRegionPill {}

describe('RoomListComponent (spec 10.7, board W22)', () => {
  let fixture: ComponentFixture<RoomListComponent>;
  let element: HTMLElement;
  const status = signal<'loading' | 'ready' | 'error' | 'disabled'>('ready');
  const rooms = signal<CommunityChannel[]>([]);
  const unread = signal(new Set<string>());

  function render(open: string | null = null): void {
    TestBed.configureTestingModule({
      imports: [RoomListComponent],
      providers: [
        provideRouter([]),
        { provide: CommunityRoomsStore, useValue: { status, rooms, unread } },
      ],
    });
    TestBed.overrideComponent(RoomListComponent, {
      remove: { imports: [RegionPillComponent] },
      add: { imports: [FakeRegionPill] },
    });
    fixture = TestBed.createComponent(RoomListComponent);
    fixture.componentRef.setInput('regionName', 'Americas (North)');
    fixture.componentRef.setInput('openSlug', open);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    status.set('ready');
    unread.set(new Set());
    rooms.set([
      fixtureRoom('yugioh', {
        name: 'Yu-Gi-Oh!',
        lastPost: {
          id: 'p',
          authorHandle: 'lucas.tcg',
          body: 'Sorted my trade binder',
          createdAt: new Date().toISOString(),
          mine: false,
        },
      }),
      fixtureRoom('pokemon', { name: 'Pokémon' }),
    ]);
  });

  it('lists the rooms with their last post, "Game rooms" and the footnote', () => {
    render('americas-north-yugioh');
    expect(element.querySelector('h2')?.textContent).toBe('Game rooms');
    const rows = [...element.querySelectorAll<HTMLAnchorElement>('[data-testid="room-row"]')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/messages/community/americas-north-yugioh',
      '/messages/community/americas-north-pokemon',
    ]);
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    expect(rows[0].textContent).toContain('lucas.tcg: Sorted my trade binder');
    expect(rows[0].getAttribute('aria-label')).toMatch(
      /^Yu-Gi-Oh! room, open\. Last post, .+: lucas\.tcg: Sorted my trade binder\.$/,
    );
    expect(rows[1].textContent).toContain('No posts yet. Say hi!');
    expect(rows[1].getAttribute('aria-label')).toBe('Pokémon room. No posts yet.');
    expect(element.querySelector('.rl__foot')?.textContent).toContain(
      'Every collector in Americas (North) can read these rooms. Keep deals and addresses in private chats.',
    );
  });

  it('a room with new posts is bold with a dot and says so; ↓ moves to the next room', () => {
    unread.set(new Set(['americas-north-yugioh']));
    render();
    const row = element.querySelector<HTMLAnchorElement>('[data-testid="room-row"]')!;
    expect(row.classList).toContain('rl__row--unread');
    expect(row.querySelector('.rl__dot')).not.toBeNull();
    expect(row.getAttribute('aria-label')).toMatch(/ New posts\.$/);
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(document.activeElement?.getAttribute('data-room')).toBe('americas-north-pokemon');
  });

  it('skeleton rows while loading, "Try again" on an error, closed while publicChat is off', () => {
    status.set('loading');
    render();
    expect(element.querySelector('[aria-busy="true"]')?.textContent).toContain('Loading the rooms');
    const retried: unknown[] = [];
    fixture.componentInstance.retry.subscribe(() => retried.push(true));
    status.set('error');
    fixture.detectChanges();
    expect(element.textContent).toContain('The rooms could not load');
    [...element.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Try again'))
      ?.click();
    expect(retried).toHaveLength(1);
    status.set('disabled');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="community-closed"]')?.textContent).toContain(
      'The community is closed right now',
    );
  });
});
