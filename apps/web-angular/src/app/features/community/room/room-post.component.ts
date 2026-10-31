import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type { PostResponse } from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { ROOM_COPY } from '../data/community-copy';
import { POST_MAX_LENGTH, postPlace, postTime } from '../data/community-rules';
import { RoomStore } from '../data/room.store';

/** What the "⋯" menu of a post asks the room for. */
export type PostAction = 'message' | 'report' | 'block' | 'delete' | 'remove';

export interface PostActionEvent {
  action: PostAction;
  post: PostResponse;
  /** The "⋯" button, where the focus goes back after a dialog. */
  opener: HTMLElement | null;
}

/**
 * One post of a room (spec 10.7, board W22): a 36 avatar, the handle (it opens the profile; "You"
 * on one's own), "{province} · {time}" (the time alone when the author shares no place; never a
 * city), the text, the photos a phone added (read only: the web posts none, community photos are
 * stage S4), a shared card ("View", Who has this card on that printing) and/or a shared deck core
 * ("Deck core", its price, "Open") or binder, or "Binder no longer available". A "⋯" menu shows on
 * hover or focus: "Message {h}", "Report this post", "Block {h}" (Remove for a moderator); one's
 * own post has Edit and Delete instead. No reply threads.
 */
@Component({
  selector: 'app-room-post',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatMenuModule,
    AvatarComponent,
    CardImageComponent,
    MediaUrlPipe,
    ShellIconComponent,
  ],
  template: `
    @let p = post();
    <article
      class="post"
      [class.post--on]="menuOpen()"
      [class.post--own]="own()"
      [attr.aria-label]="label()"
      [attr.data-post-id]="p.id"
      data-testid="room-post"
    >
      <a
        class="post__avatar"
        [routerLink]="['/collectors', p.author.handle]"
        tabindex="-1"
        aria-hidden="true"
      >
        <app-avatar
          [src]="p.author.avatarUrl"
          [name]="p.author.handle"
          [decorative]="true"
          style="--avatar-size: 36px"
        />
      </a>
      <div class="post__main">
        <div class="post__head">
          <a class="post__handle" [routerLink]="['/collectors', p.author.handle]">{{
            p.author.handle
          }}</a>
          @if (own()) {
            <span class="post__you">{{ copy.you }}</span>
          }
          <span class="post__meta">
            {{ place() ? place() + ' · ' : ''
            }}<time [attr.datetime]="p.createdAt">{{ time() }}</time>
            @if (p.editedAt) {
              · {{ copy.edited }}
            }
          </span>
          @if (hasMenu()) {
            <button
              #more
              type="button"
              class="post__more"
              [class.post__more--on]="menuOpen()"
              [attr.aria-label]="copy.more(p.author.handle)"
              title="More"
              data-testid="post-more"
              [matMenuTriggerFor]="menu"
              (menuOpened)="menuOpen.set(true)"
              (menuClosed)="menuOpen.set(false)"
            >
              <app-shell-icon name="more" [size]="18" [stroke]="2.6" />
            </button>
            <mat-menu
              #menu="matMenu"
              xPosition="before"
              [class]="layout.narrow() ? 'app-more-menu app-menu--sheet' : 'app-more-menu'"
              [backdropClass]="
                layout.narrow() ? 'cdk-overlay-dark-backdrop' : 'cdk-overlay-transparent-backdrop'
              "
            >
              @if (own()) {
                @if (p.canEdit) {
                  <button mat-menu-item type="button" (click)="startEdit()">
                    <app-shell-icon name="pencil" [size]="20" />
                    <span>{{ copy.edit }}</span>
                  </button>
                }
                @if (p.canDelete) {
                  <button
                    mat-menu-item
                    type="button"
                    class="app-more-menu__danger"
                    (click)="emit('delete')"
                  >
                    <app-shell-icon name="trash" [size]="20" />
                    <span>{{ copy.delete }}</span>
                  </button>
                }
              } @else {
                <button mat-menu-item type="button" (click)="emit('message')">
                  <app-shell-icon name="messageSquare" [size]="20" />
                  <span>{{ copy.message(p.author.handle) }}</span>
                </button>
                <button mat-menu-item type="button" (click)="emit('report')">
                  <app-shell-icon name="flag" [size]="20" />
                  <span>{{ copy.report }}</span>
                </button>
                @if (moderator()) {
                  <button mat-menu-item type="button" (click)="emit('remove')">
                    <app-shell-icon name="shield" [size]="20" />
                    <span>{{ copy.remove }}</span>
                  </button>
                }
                <div class="app-more-menu__divider" role="separator"></div>
                <button
                  mat-menu-item
                  type="button"
                  class="app-more-menu__danger"
                  (click)="emit('block')"
                >
                  <app-shell-icon name="ban" [size]="20" />
                  <span>{{ copy.block(p.author.handle) }}</span>
                </button>
              }
            </mat-menu>
          }
        </div>

        @if (editing()) {
          <form class="post__edit" (submit)="saveEdit($event)">
            <label class="visually-hidden" [for]="editId">{{ copy.editLabel }}</label>
            <textarea
              #editor
              class="post__edit-text"
              [id]="editId"
              [formControl]="editText"
              [attr.maxlength]="maxLength"
              rows="3"
              (keydown.escape)="cancelEdit($event)"
            ></textarea>
            @if (editError(); as message) {
              <p class="post__error" role="alert">{{ message }}</p>
            }
            <div class="post__edit-actions">
              <button type="button" class="post__ghost" (click)="cancelEdit()">
                {{ copy.cancel }}
              </button>
              <button type="submit" class="post__save" [disabled]="saving()">
                {{ saving() ? copy.saving : copy.save }}
              </button>
            </div>
          </form>
        } @else {
          <p class="post__text">{{ p.body }}</p>
        }

        @if (photos().length > 0) {
          <div
            class="post__photos"
            [class.post__photos--one]="photos().length === 1"
            role="group"
            [attr.aria-label]="copy.photos(photos().length, p.author.handle)"
          >
            @for (photo of photos(); track photo.url; let i = $index) {
              <button
                type="button"
                class="post__photo"
                [attr.aria-label]="copy.photo(i + 1, photos().length, p.author.handle)"
                (click)="photoOpened.emit({ post: p, index: i })"
              >
                <img [src]="photo.url | mediaUrl" alt="" loading="lazy" decoding="async" />
              </button>
            }
          </div>
        }

        @if (p.payload.card; as card) {
          <div class="share share--card" data-testid="post-card">
            <span class="share__art share__art--card" aria-hidden="true">
              <app-card-image size="fill" [src]="card.imageUrl" [game]="game()" alt="" />
            </span>
            <span class="share__text">
              <span class="share__name">{{ card.name }}</span>
              @if (card.printingCode) {
                <span class="share__code">{{ card.printingCode }}</span>
              }
            </span>
            <a
              class="share__link"
              [routerLink]="['/cards', card.cardId]"
              [queryParams]="{ printing: card.id }"
              [attr.aria-label]="copy.viewCard(card.name)"
              >{{ copy.view }}</a
            >
          </div>
        }
        <!-- A post may share a card and a binder or deck core together (WF review U2). -->
        @if (p.payload.binder; as binder) {
          <div
            class="share"
            [class.share--core]="binder.deckCore"
            [attr.data-testid]="binder.deckCore ? 'post-deck-core' : 'post-binder'"
          >
            @if (binder.deckCore) {
              <span class="share__art share__art--core" aria-hidden="true">
                @if (binder.imageUrl) {
                  <img [src]="binder.imageUrl | mediaUrl" alt="" loading="lazy" />
                } @else {
                  <app-shell-icon name="layers" [size]="22" />
                }
              </span>
            } @else {
              <span class="share__stack" aria-hidden="true">
                <span class="share__sheet share__sheet--back"></span>
                <span class="share__sheet">
                  @if (binder.imageUrl) {
                    <img [src]="binder.imageUrl | mediaUrl" alt="" loading="lazy" />
                  }
                </span>
              </span>
            }
            <span class="share__text">
              <span class="share__name">{{ binder.name }}</span>
              <!-- No game: a post may share a binder of any game, and its data names none
                   (WF review F5). -->
              @if (binder.deckCore) {
                <span class="share__badge">{{ copy.deckCore }}</span>
                @if (binder.askingPriceText?.trim(); as price) {
                  <span class="share__line">{{ price }}</span>
                }
              } @else {
                <span class="share__line">{{ copy.publicBinder }}</span>
              }
            </span>
            <a
              class="share__link"
              [routerLink]="['/binders', binder.id]"
              [attr.aria-label]="copy.openBinder(binder.name)"
              >{{ copy.open }}</a
            >
          </div>
        } @else if (p.payload.binderUnavailable) {
          <p class="share share--gone" data-testid="post-binder-gone">
            <app-shell-icon name="binder" [size]="18" />
            {{ copy.binderUnavailable }}
          </p>
        }
      </div>
    </article>
  `,
  styleUrl: './room-post.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPostComponent {
  private readonly store = inject(RoomStore);
  protected readonly layout = inject(ShellLayout);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly moreButton = viewChild<ElementRef<HTMLButtonElement>>('more');
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  readonly post = input.required<PostResponse>();
  /** The room's game (the card art's placeholder). */
  readonly game = input<string | null>(null);
  /** The words of the day separator above it ("Yesterday"), for its spoken label. */
  readonly day = input('');
  readonly action = output<PostActionEvent>();
  readonly photoOpened = output<{ post: PostResponse; index: number }>();

  protected readonly copy = ROOM_COPY;
  protected readonly maxLength = POST_MAX_LENGTH;
  protected readonly editId = `post-edit-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly menuOpen = signal(false);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editText = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(POST_MAX_LENGTH)],
  });

  protected readonly own = computed(() => this.post().author.id === this.store.selfId());
  protected readonly moderator = computed(() => this.store.isModerator() && !this.own());
  protected readonly hasMenu = computed(() => {
    const post = this.post();
    return !this.own() || post.canEdit || post.canDelete;
  });
  protected readonly place = computed(() => postPlace(this.post()));
  protected readonly time = computed(() => postTime(this.post().createdAt));
  protected readonly photos = computed(() => this.post().payload.photos ?? []);
  protected readonly label = computed(() => {
    const post = this.post();
    const day = this.day();
    return ROOM_COPY.postLabel({
      handle: post.author.handle,
      own: this.own(),
      place: this.place(),
      when: day && day !== 'Today' ? `${day} ${this.time()}` : this.time(),
    });
  });

  /** The focus on the handle, the post's first link (older posts shown; WF review A2). */
  focusHandle(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.post__handle')?.focus();
  }

  /** The "⋯" button (the focus goes back to it after a dialog). */
  focusMore(): boolean {
    const button = this.moreButton()?.nativeElement;
    if (!button) {
      return false;
    }
    button.focus();
    return true;
  }

  protected emit(action: PostAction): void {
    this.action.emit({
      action,
      post: this.post(),
      opener: this.moreButton()?.nativeElement ?? null,
    });
  }

  protected startEdit(): void {
    this.editText.setValue(this.post().body);
    this.editError.set(null);
    this.editing.set(true);
    setTimeout(() => this.editor()?.nativeElement.focus());
  }

  protected cancelEdit(event?: Event): void {
    event?.stopPropagation();
    this.editing.set(false);
    this.editError.set(null);
    setTimeout(() => this.focusMore() || this.host.nativeElement.querySelector('a')?.focus());
  }

  protected async saveEdit(event: Event): Promise<void> {
    event.preventDefault();
    const body = this.editText.value.trim();
    if (!body) {
      this.editError.set(ROOM_COPY.needsText);
      return;
    }
    if (body === this.post().body) {
      this.cancelEdit();
      return;
    }
    this.saving.set(true);
    const problem = await this.store.update(this.post().id, body);
    this.saving.set(false);
    if (problem) {
      this.editError.set(problem);
      return;
    }
    this.cancelEdit();
  }
}
