import { Component, forwardRef, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CommunityChannel } from '@orenji/api-client';
import { RegionContext } from '../../core/region/region-context.service';
import { RegionsStore } from '../../shared/regions/regions.store';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { CommunityViewComponent } from './community-view.component';
import { CommunityRoomsStore } from './data/community-rooms.store';
import { RoomListComponent } from './room-list/room-list.component';
import { fixtureRoom } from './testing/community-fixtures';

const focusedRows: (string | null | undefined)[] = [];

@Component({
  selector: 'app-room-list',
  template: '',
  // The view finds its list by the real class (its Esc and Back give the focus to a row).
  providers: [{ provide: RoomListComponent, useExisting: forwardRef(() => FakeRoomList) }],
})
class FakeRoomList {
  readonly openSlug = input<string | null>(null);
  readonly regionName = input('');
  focusRow(slug?: string | null): boolean {
    focusedRows.push(slug ?? this.openSlug());
    return true;
  }
}

@Component({ selector: 'app-room-view', template: '<p class="fake-room">{{ room().slug }}</p>' })
class FakeRoomView {
  readonly room = input.required<CommunityChannel>();
  readonly regionName = input('');
  readonly showBack = input(false);
  focusStart(): void {
    // nothing to focus in the fake
  }
}

describe('CommunityViewComponent (spec 10.7 and 10.8)', () => {
  let fixture: ComponentFixture<CommunityViewComponent>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const current = signal('americas-north');
  const select = vi.fn((code: string) => current.set(code));
  const listed = signal<CommunityChannel[]>([]);
  const status = signal<'loading' | 'ready' | 'error' | 'disabled'>('ready');
  const refresh = vi.fn();
  const storeRegion = signal<string | null>('americas-north');
  const load = vi.fn((region: string) => storeRegion.set(region));

  function render(split: boolean, slug: string | null): void {
    TestBed.configureTestingModule({
      imports: [CommunityViewComponent],
      providers: [
        provideRouter([]),
        { provide: RegionContext, useValue: { current, select } },
        {
          provide: RegionsStore,
          useValue: {
            regions: signal([
              { code: 'americas-north' },
              { code: 'americas-south' },
              { code: 'europe' },
            ]),
            regionName: (code: string) => code,
            load: vi.fn(async () => true),
          },
        },
      ],
    });
    TestBed.overrideComponent(CommunityViewComponent, {
      set: {
        imports: [FakeRoomList, FakeRoomView, EmptyStateComponent, SkeletonComponent],
        providers: [
          {
            provide: CommunityRoomsStore,
            useValue: {
              status,
              region: storeRegion,
              rooms: listed,
              load,
              refresh,
              room: (s: string | null) => listed().find((room) => room.slug === s) ?? null,
            },
          },
        ],
      },
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CommunityViewComponent);
    fixture.componentRef.setInput('split', split);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
  }

  beforeEach(() => {
    current.set('americas-north');
    storeRegion.set('americas-north');
    select.mockClear();
    load.mockClear();
    refresh.mockClear();
    focusedRows.length = 0;
    status.set('ready');
    listed.set([fixtureRoom('pokemon'), fixtureRoom('yugioh')]);
  });

  it("reads the browsed region's rooms; at 960 and wider Community opens the first room", () => {
    render(true, null);
    expect(load).toHaveBeenCalledWith('americas-north');
    expect(navigate).toHaveBeenCalledWith(['/messages', 'community', 'americas-north-pokemon'], {
      replaceUrl: true,
    });
  });

  it('below 960 Community is the list alone, without opening a room', () => {
    render(false, null);
    expect(navigate).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-room-list')).not.toBeNull();
  });

  it('a link to a room of another region browses that region', () => {
    render(true, 'europe-yugioh');
    expect(select).toHaveBeenCalledWith('europe');
  });

  it("switching the region in the pill opens the same game's room there", () => {
    render(true, 'americas-north-yugioh');
    expect((fixture.nativeElement as HTMLElement).querySelector('.fake-room')?.textContent).toBe(
      'americas-north-yugioh',
    );
    navigate.mockClear();
    current.set('americas-south');
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/messages', 'community', 'americas-south-yugioh'], {
      replaceUrl: true,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('Esc in a room gives the focus back to its row (spec 10.2; WF review M43)', () => {
    render(true, 'americas-north-yugioh');
    const room = (fixture.nativeElement as HTMLElement).querySelector('app-room-view')!;
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    room.dispatchEvent(escape);
    expect(focusedRows).toEqual(['americas-north-yugioh']);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('reads the rooms again every 15 s and when the tab comes back, not while hidden (WF review F6, U5)', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      render(true, 'americas-north-yugioh');
      vi.advanceTimersByTime(15_000);
      expect(refresh).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      vi.advanceTimersByTime(15_000);
      expect(refresh).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(refresh).toHaveBeenCalledTimes(2);
      fixture.destroy();
      vi.advanceTimersByTime(60_000);
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      delete (document as unknown as Record<string, unknown>)['visibilityState'];
    }
  });

  it('the community closed: the room pane says so too, also for a room link (WF review A6)', () => {
    status.set('disabled');
    render(true, 'americas-north-yugioh');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.fake-room')).toBeNull();
    expect(element.querySelector('[data-testid="community-closed-pane"]')?.textContent).toContain(
      'The community is closed right now',
    );
    expect(element.textContent).not.toContain('Choose a room');
  });

  it('the rooms failed to load: the room pane offers Try again, never blank (WF review U10)', () => {
    status.set('error');
    render(true, 'americas-north-mtg');
    const pane = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="room-list-failed"]',
    )!;
    expect(pane.textContent).toContain('Choose a room once the list loads');
    pane.querySelector<HTMLButtonElement>('button')!.click();
    expect(load).toHaveBeenCalledWith('americas-north', true);
  });

  it("a room that is not among the region's rooms says it is closed, with All rooms", () => {
    render(true, 'americas-north-looking');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('This room is closed');
    expect(text).toContain('All rooms');
  });
});
