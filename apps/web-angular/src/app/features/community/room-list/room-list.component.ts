import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { RegionPillComponent } from '../../../core/layout/region-pill/region-pill.component';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { ROOMS_COPY } from '../data/community-copy';
import { CommunityRoomsStore } from '../data/community-rooms.store';
import { roomPreview, roomTime } from '../data/community-rules';

interface RoomRow {
  slug: string;
  game: string | null;
  name: string;
  when: string;
  preview: string;
  hasPost: boolean;
  unread: boolean;
  open: boolean;
  label: string;
}

/**
 * The inbox column of Messages › Community (spec 10.7, board W22): Community's own region pill,
 * "Game rooms" and the five rooms of the region (64 rows: a 38 tile, the game, the last post and
 * its time; bold with an orange dot while someone else posted since the last visit in this
 * browser), then the footnote "Every collector in {region} can read these rooms…". Skeleton rows,
 * an error with "Try again", "The community is closed right now". ↑ and ↓ move between rooms.
 */
@Component({
  selector: 'app-room-list',
  imports: [RouterLink, ErrorStateComponent, GameMonogramComponent, RegionPillComponent, ShellIconComponent],
  template: `
    <div class="rl">
      <div class="rl__top">
        <app-region-pill class="rl__pill" wide />
        <h2 class="rl__heading">{{ copy.heading }}</h2>
      </div>
      @switch (store.status()) {
        @case ('error') {
          <div class="rl__pad">
            <app-error-state
              compact
              [title]="copy.loadError"
              retryLabel="Try again"
              (retry)="retry.emit()"
            />
          </div>
        }
        @case ('disabled') {
          <div class="rl__closed" data-testid="community-closed">
            <p class="rl__closed-title">{{ copy.closedTitle }}</p>
            <p class="rl__closed-text">{{ copy.closedBody }}</p>
            <a class="rl__outline" routerLink="/messages">{{ copy.closedAction }}</a>
          </div>
        }
        @case ('ready') {
          @if (rows().length === 0) {
            <div class="rl__closed">
              <p class="rl__closed-title">{{ copy.emptyTitle(regionName()) }}</p>
              <p class="rl__closed-text">{{ copy.emptyBody }}</p>
            </div>
          } @else {
            <ul class="rl__rows" [attr.aria-label]="copy.group(regionName())">
              @for (row of rows(); track row.slug; let i = $index) {
                <li>
                  <a
                    class="rl__row"
                    [class.rl__row--open]="row.open"
                    [class.rl__row--unread]="row.unread"
                    [routerLink]="['/messages/community', row.slug]"
                    [attr.aria-current]="row.open ? 'page' : null"
                    [attr.aria-label]="row.label"
                    [attr.data-room]="row.slug"
                    data-testid="room-row"
                    (keydown.arrowdown)="move(i + 1, $event)"
                    (keydown.arrowup)="move(i - 1, $event)"
                  >
                    @if (row.game) {
                      <app-game-monogram class="rl__tile" [game]="row.game" [size]="38" />
                    }
                    <span class="rl__text">
                      <span class="rl__line">
                        <span class="rl__name">{{ row.name }}</span>
                        <span class="rl__when">{{ row.when }}</span>
                      </span>
                      <span class="rl__line">
                        <span class="rl__preview" [class.rl__preview--none]="!row.hasPost">{{
                          row.preview
                        }}</span>
                        @if (row.unread) {
                          <span class="rl__dot" aria-hidden="true"></span>
                        }
                      </span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        }
        @default {
          <div class="rl__rows" aria-busy="true">
            <span class="visually-hidden">{{ copy.loading }}</span>
            @for (bone of [0, 1, 2, 3, 4]; track bone) {
              <div class="rl__bone" aria-hidden="true">
                <span class="rl__bone-tile"></span>
                <span class="rl__bone-lines"><span></span><span></span></span>
              </div>
            }
          </div>
        }
      }
      <p class="rl__foot">
        <app-shell-icon name="shieldCheck" [size]="16" [stroke]="2" />
        <span>{{ copy.footnote(regionName()) }}</span>
      </p>
    </div>
  `,
  styleUrl: './room-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomListComponent {
  protected readonly store = inject(CommunityRoomsStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The open room's slug (`null`: none). */
  readonly openSlug = input<string | null>(null);
  readonly regionName = input.required<string>();
  /** "Try again" after the rooms failed to load. */
  readonly retry = output<void>();

  protected readonly copy = ROOMS_COPY;
  /** Ticks with the list (each read): the rows' times are worded against it. */
  private readonly now = computed(() => {
    this.store.rooms();
    return new Date();
  });

  protected readonly rows = computed<RoomRow[]>(() => {
    const unread = this.store.unread();
    const open = this.openSlug();
    const now = this.now();
    return this.store.rooms().map((room) => {
      const preview = roomPreview(room.lastPost);
      const when = room.lastPost ? roomTime(room.lastPost.createdAt, now) : '';
      const isUnread = unread.has(room.slug);
      const isOpen = room.slug === open;
      return {
        slug: room.slug,
        game: room.game ?? null,
        name: room.name,
        when,
        preview: preview ?? ROOMS_COPY.noPosts,
        hasPost: !!preview,
        unread: isUnread,
        open: isOpen,
        label: ROOMS_COPY.rowLabel({
          name: room.name,
          open: isOpen,
          preview,
          when,
          unread: isUnread,
        }),
      };
    });
  });

  /** The focus on a room's row (the open one by default; Esc in a room comes back here). */
  focusRow(slug?: string | null): boolean {
    const rows = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.rl__row')];
    const row =
      rows.find((item) => item.dataset['room'] === (slug ?? this.openSlug())) ?? rows[0] ?? null;
    row?.focus();
    return !!row;
  }

  protected move(index: number, event: Event): void {
    const rows = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.rl__row')];
    const row = rows[index];
    if (row) {
      event.preventDefault();
      row.focus();
    }
  }
}
