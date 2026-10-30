import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CommunityChannel } from '@orenji/api-client';
import { RegionContext } from '../../core/region/region-context.service';
import { RegionsStore } from '../../shared/regions/regions.store';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { CommunityViewComponent } from './community-view.component';
import { CommunityRoomsStore } from './data/community-rooms.store';
import { fixtureRoom } from './testing/community-fixtures';

@Component({ selector: 'app-room-list', template: '' })
class FakeRoomList {
  readonly openSlug = input<string | null>(null);
  readonly regionName = input('');
  focusRow(): boolean {
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
  const status = signal<'loading' | 'ready'>('ready');
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

  it("a room that is not among the region's rooms says it is closed, with All rooms", () => {
    render(true, 'americas-north-looking');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('This room is closed');
    expect(text).toContain('All rooms');
  });
});
