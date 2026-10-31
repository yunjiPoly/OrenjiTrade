import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { RegionContext } from '../../core/region/region-context.service';
import { PLATFORM_REGION_NAMES, RegionsStore } from '../../shared/regions/regions.store';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { ROOM_COPY, ROOMS_COPY } from './data/community-copy';
import { CommunityRoomsStore } from './data/community-rooms.store';
import { ROOM_POLL_MS, gameOfSlug, regionOfSlug, roomSlug } from './data/community-rules';
import { RoomListComponent } from './room-list/room-list.component';
import { RoomViewComponent } from './room/room-view.component';

/**
 * Messages › Community on the web (stage WF, spec 10.7 and 10.8, board W22; the phone's R11
 * rooms): the inbox column (340 at lg, 300 at md, the page's header projected on top as
 * `[inboxHeader]`) with Community's own region pill, the five game rooms and the footnote, beside
 * the open room; below 960 one pane per route, the list or the room with Back. At 960 and wider
 * `/messages?tab=community` opens the browsed game's room of the browsed region. A link to a room
 * of another region browses that region; switching the region in the pill opens the same game's
 * room there. Container of {@link CommunityRoomsStore}.
 */
@Component({
  selector: 'app-community-view',
  imports: [EmptyStateComponent, RoomListComponent, RoomViewComponent, SkeletonComponent],
  providers: [CommunityRoomsStore],
  template: `
    <div class="cv" [class.cv--split]="split()">
      @if (split() || !slug() || store.status() === 'disabled') {
        <div class="cv__list">
          <ng-content select="[inboxHeader]" />
          <app-room-list [openSlug]="slug()" [regionName]="regionName()" (retry)="reload()" />
        </div>
      }
      @if (store.status() === 'disabled') {
        @if (split()) {
          <!-- The community is closed: the room pane says so too (WF review A6). -->
          <div class="cv__room cv__missing" data-testid="community-closed-pane">
            <app-empty-state
              icon="speaker_notes_off"
              [title]="roomsCopy.closedTitle"
              [description]="roomsCopy.closedBody"
            />
          </div>
        }
      } @else if (slug(); as current) {
        @if (room(); as r) {
          <app-room-view
            class="cv__room"
            [room]="r"
            [regionName]="regionName()"
            [showBack]="!split()"
            (back)="toList()"
            (keydown.escape)="onEscape($event)"
          />
        } @else if (store.status() === 'loading' || waitingForRegion()) {
          <div class="cv__room cv__missing" aria-busy="true">
            <span class="visually-hidden">{{ roomCopy.loading }}</span>
            <div class="cv__pad"><app-skeleton variant="list" lines="4" /></div>
          </div>
        } @else if (store.status() === 'error') {
          <!-- The rooms could not load: the room pane is not left blank (WF review U10). -->
          <div class="cv__room cv__missing" data-testid="room-list-failed">
            <app-empty-state
              icon="forum"
              [title]="roomsCopy.waitTitle"
              [description]="roomsCopy.waitBody"
            >
              <button actions type="button" class="cv__outline" (click)="reload()">
                Try again
              </button>
            </app-empty-state>
          </div>
        } @else if (store.status() === 'ready') {
          <div class="cv__room cv__missing" data-testid="room-not-found">
            <app-empty-state
              icon="speaker_notes_off"
              [title]="roomCopy.notFoundTitle"
              [description]="roomCopy.notFoundBody"
            >
              <button actions type="button" class="cv__outline" (click)="toList()">
                {{ roomCopy.notFoundAction }}
              </button>
            </app-empty-state>
          </div>
        } @else if (!split()) {
          <div class="cv__room cv__missing">
            <app-empty-state
              icon="forum"
              [title]="roomsCopy.chooseTitle"
              [description]="roomsCopy.chooseBody"
            >
              <button actions type="button" class="cv__outline" (click)="toList()">
                {{ roomCopy.notFoundAction }}
              </button>
            </app-empty-state>
          </div>
        }
      } @else if (split()) {
        <div class="cv__room cv__missing">
          @if (store.status() === 'error') {
            <app-empty-state
              icon="forum"
              [title]="roomsCopy.waitTitle"
              [description]="roomsCopy.waitBody"
            >
              <button actions type="button" class="cv__outline" (click)="reload()">
                Try again
              </button>
            </app-empty-state>
          } @else {
            <app-empty-state
              icon="forum"
              [title]="roomsCopy.chooseTitle"
              [description]="roomsCopy.chooseBody"
            />
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .cv {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }
    .cv__list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      background: var(--color-background);
    }
    .cv__room {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .cv__missing {
      justify-content: center;
      background: var(--color-background);
    }
    .cv__pad {
      padding: var(--spacing-4);
    }
    .cv__outline {
      height: 36px;
      padding: 0 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .cv__outline:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .cv--split {
      flex-direction: row;
    }
    .cv--split .cv__list {
      flex: 0 0 340px;
      width: 340px;
      border-right: 1px solid var(--color-border);
    }
    @media (max-width: 1279.98px) {
      .cv--split .cv__list {
        flex-basis: 300px;
        width: 300px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityViewComponent {
  protected readonly store = inject(CommunityRoomsStore);
  private readonly region = inject(RegionContext);
  private readonly regions = inject(RegionsStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly list = viewChild(RoomListComponent);
  private readonly roomView = viewChild(RoomViewComponent);

  /** The inbox beside the room (960 and wider). */
  readonly split = input(false);
  /** The open room (`/messages/community/:room`), or `null`. */
  readonly slug = input<string | null>(null);

  protected readonly roomCopy = ROOM_COPY;
  protected readonly roomsCopy = ROOMS_COPY;
  protected readonly regionName = computed(() => this.regions.regionName(this.region.current()));
  protected readonly room = computed(() => this.store.room(this.slug()));
  /** The URL's room is of another region than the one listed: that region is being read. */
  protected readonly waitingForRegion = computed(() => {
    const slug = this.slug();
    const named = slug ? regionOfSlug(slug, this.regionCodes()) : null;
    return !!named && named !== this.store.region();
  });
  private readonly regionCodes = computed(() => {
    const listed = this.regions.regions().map((region) => region.code);
    return listed.length ? listed : Object.keys(PLATFORM_REGION_NAMES);
  });
  /** The region browsed when the URL's room last settled (tells a pill switch from a link). */
  private settledRegion: string | null = null;
  private shownRoom: string | null | undefined = undefined;

  constructor() {
    void this.regions.load();
    // The rooms of the browsed region.
    effect(() => {
      const region = this.region.current();
      untracked(() => this.store.load(region));
    });
    // A link to another region's room browses that region; the pill's switch opens the same
    // game's room in the new region.
    effect(() => {
      const slug = this.slug();
      const region = this.region.current();
      untracked(() => this.follow(slug, region));
    });
    // At 960 and wider, "Community" opens a room: the browsed game's, else the first.
    effect(() => {
      const split = this.split();
      const slug = this.slug();
      const status = this.store.status();
      const rooms = this.store.rooms();
      untracked(() => {
        if (split && !slug && status === 'ready' && rooms.length > 0) {
          void this.router.navigate(['/messages', 'community', rooms[0].slug], {
            replaceUrl: true,
          });
        }
      });
    });
    // Rooms have no push: the list (the last posts, the dots) is read again every 15 s while the
    // page is on screen, and at once when it comes back (WF review F6, U5 and P1); a failed read
    // keeps what is shown.
    const poll = setInterval(() => this.refreshRooms(), ROOM_POLL_MS);
    const onVisible = () => this.refreshRooms();
    this.document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(poll);
      this.document.removeEventListener('visibilitychange', onVisible);
    });
    // One pane per route below 960: the focus goes to the room's Back, or back to its row.
    effect(() => {
      const shown = this.room()?.slug ?? null;
      const split = this.split();
      untracked(() => {
        const previous = this.shownRoom;
        this.shownRoom = shown;
        if (split || previous === undefined || previous === shown) {
          return;
        }
        afterNextRender(
          () => {
            const active = this.document.activeElement;
            if (active && active !== this.document.body && active.isConnected) {
              return;
            }
            if (shown) {
              this.roomView()?.focusStart();
            } else if (previous) {
              this.list()?.focusRow(previous);
            }
          },
          { injector: this.injector },
        );
      });
    });
  }

  protected reload(): void {
    this.store.load(this.region.current(), true);
  }

  private refreshRooms(): void {
    if (this.document.visibilityState !== 'hidden') {
      this.store.refresh();
    }
  }

  protected toList(): void {
    void this.router.navigate(['/messages'], { queryParams: { tab: 'community' } });
  }

  /** Esc in the room (nothing else took it): the focus goes back to its row (spec 10.2). */
  protected onEscape(event: Event): void {
    if (event.defaultPrevented || !this.split()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('[role="dialog"], .mat-mdc-menu-panel')) {
      return;
    }
    event.preventDefault();
    this.list()?.focusRow();
  }

  private follow(slug: string | null, region: string): void {
    const previous = this.settledRegion;
    this.settledRegion = region;
    if (!slug) {
      return;
    }
    const named = regionOfSlug(slug, this.regionCodes());
    if (!named || named === region) {
      return;
    }
    if (previous !== null && previous !== region && named === previous) {
      // The pill switched the region while a room was open: the same game's room there.
      const game = gameOfSlug(slug, named);
      void this.router.navigate(
        game ? ['/messages', 'community', roomSlug(region, game)] : ['/messages'],
        game ? { replaceUrl: true } : { queryParams: { tab: 'community' }, replaceUrl: true },
      );
      return;
    }
    // A link to a room of another region: browse that region.
    this.region.select(named);
  }
}
