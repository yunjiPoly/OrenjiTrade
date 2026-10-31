import { DOCUMENT } from '@angular/common';
import { GuestActions } from '../../../core/guest/guest-actions.service';
import { cardSubject, guestPlace, personSubject } from '../../../core/guest/guest-actions';
import { printingImageUrl } from '../../inventory/inventory-labels';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SearchService } from '@orenji/api-client';
import type { CardHolderResult, PublicBinderSummary } from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { itemPriceText } from '../../../features/inventory/data/item-price';
import { ChatDrawer } from '../../messaging/chat-drawer.service';
import { WhoHasCoresComponent } from './who-has-cores.component';
import { AvatarComponent } from '../../ui/avatar/avatar.component';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { printingCode } from '../../inventory/inventory-labels';
import {
  HolderGroup,
  ViewerPlace,
  groupAnchor,
  groupHolders,
  holderLine,
  holderPrice,
  messageLabel,
} from './holder-groups';

/** Holders per page (`GET /search/card-holders`, page by page with "Load more"). */
export const WHO_HAS_PAGE_SIZE = 20;
/** Deck cores in "Also in a deck core" (spec 7.3: up to 3 rows). */
export const WHO_HAS_DECK_CORES = 3;

type Status = 'loading' | 'ready' | 'error';

/**
 * "Who has this card" (spec 7.3 and 7.4, board W7; the phone's screen 13), shared by the card
 * page and Search › Wishlist's holder pane (spec 6.6): the holders of the browsed region grouped
 * by state or province (`sort=province`, the viewer's own first; group headers sticky), "Jump to"
 * chips of the provinces in the list (no numbers, no map), "Also in a deck core" (up to 3), rows
 * with the handle, the code, the rarity and the public note on one line (the whole note in a
 * tooltip and in the row's description), the price as typed, "×n" and "Message", which opens the
 * chat drawer about this copy. Rows are one tab stop (roving tabindex: ↑↓ or j k, Home, End,
 * Enter opens the profile). A guest reads "A collector" with a plain avatar and no presence;
 * Message and the row ask them to sign in. No counts anywhere, never a market price or card text.
 */
@Component({
  selector: 'app-who-has',
  imports: [RouterLink, AvatarComponent, ShellIconComponent, WhoHasCoresComponent],
  template: `
    @if (status() === 'loading' && rows().length === 0) {
      <div class="wh__skeleton" aria-busy="true" data-testid="who-has-skeleton">
        <span class="visually-hidden">Loading who has this card</span>
        @for (bone of bones; track bone) {
          <div class="wh__bone" aria-hidden="true">
            <span class="wh__bone-avatar"></span>
            <span class="wh__bone-lines"><span></span><span></span></span>
          </div>
        }
      </div>
    } @else if (status() === 'error' && rows().length === 0) {
      <div class="wh__state" role="alert" data-testid="who-has-error">
        <p class="wh__state-title">Couldn't load who has this card.</p>
        <button type="button" class="wh__retry" (click)="reload()">Try again</button>
      </div>
    } @else if (rows().length === 0) {
      <div class="wh__state" data-testid="who-has-empty">
        <p class="wh__state-title">Nobody in {{ regionName() }} lists this card yet.</p>
        @if (wished()) {
          <p class="wh__state-line" data-testid="who-has-wished">
            On your wishlist · We'll tell you when someone lists it.
          </p>
        } @else if (offerWish()) {
          <button type="button" class="wh__wish" (click)="wishRequested.emit()">
            <app-shell-icon name="star" [size]="18" />
            Add to wishlist
          </button>
          <p class="wh__state-line">We'll tell you when someone lists it.</p>
        }
      </div>
    } @else {
      @if (groups().length > 1) {
        <nav class="wh__jump" aria-label="Jump to a state or province">
          <span class="wh__jump-label" aria-hidden="true">Jump to:</span>
          @for (group of groups(); track group.key) {
            <button type="button" class="wh__chip" (click)="jump(group)">{{ group.name }}</button>
          }
        </nav>
      }
      @if (deckCores().length > 0) {
        <app-who-has-cores [cores]="deckCores()" [prefix]="prefix()" />
      }
      <div class="wh__groups" tabindex="-1" (keydown)="onKeydown($event)">
        @for (group of groups(); track group.key) {
          <section class="wh__group" [attr.aria-labelledby]="anchor(group)">
            <h3
              class="wh__group-title"
              [id]="anchor(group)"
              [attr.aria-level]="groupLevel() === 3 ? null : groupLevel()"
              [style.top.px]="stickyTop()"
              tabindex="-1"
            >
              {{ group.name }}
              @if (group.suffix) {
                <span class="wh__group-suffix" [class.wh__group-suffix--mine]="group.mine"
                  >&nbsp;· {{ group.suffix }}</span
                >
              }
            </h3>
            <ul class="wh__rows">
              @for (result of group.rows; track result.item.id) {
                @let handle = result.collector.handle;
                @let active = activeId() === result.item.id;
                <li
                  class="wh__row"
                  [class.wh__row--guest]="!handle"
                  [class.wh__row--tip-off]="tipsOff().has(result.item.id)"
                  [attr.data-item]="result.item.id"
                  [attr.tabindex]="active ? 0 : -1"
                  [attr.aria-label]="rowLabel(result)"
                  [attr.aria-describedby]="result.item.publicNotes ? noteId(result) : null"
                  data-testid="holder-row"
                  (focus)="activeId.set(result.item.id)"
                  (click)="onRowClick($event, result)"
                  (keydown.enter)="onRowEnter($event, result)"
                  (keydown.escape)="dismissTip($event, result)"
                  (mouseenter)="hoveredTip = result.item.publicNotes ? result.item.id : null"
                  (mouseleave)="hoveredTip = null; tipOn(result.item.id)"
                  (focusout)="tipOn(result.item.id)"
                >
                  <span class="wh__avatar">
                    @if (handle) {
                      <app-avatar
                        [src]="result.collector.avatarUrl"
                        [name]="result.collector.displayName || handle"
                        [decorative]="true"
                      />
                      @if (result.collector.onlineStatus === 'ONLINE') {
                        <span class="wh__online" aria-hidden="true"></span>
                      }
                    } @else {
                      <span class="wh__guest-avatar" aria-hidden="true"
                        ><app-shell-icon name="profile" [size]="18"
                      /></span>
                    }
                  </span>
                  <span class="wh__who">
                    <span class="wh__line1">
                      @if (handle) {
                        <a
                          class="wh__handle"
                          [routerLink]="['/collectors', handle]"
                          [attr.tabindex]="active ? 0 : -1"
                          >{{ handle }}</a
                        >
                      } @else {
                        <span class="wh__handle">A collector</span>
                      }
                      <span class="wh__place">{{ result.collector.place.subdivisionName }}</span>
                    </span>
                    <span class="wh__line2">
                      <span class="wh__code mono">{{ code(result) }}</span>
                      @if (result.item.printing.rarity) {
                        <span> · {{ result.item.printing.rarity }}</span>
                      }
                      @if (result.item.publicNotes) {
                        <span class="wh__note"> · {{ result.item.publicNotes }}</span>
                      }
                    </span>
                    @if (result.item.publicNotes) {
                      <span class="wh__tip" role="tooltip" [id]="noteId(result)">{{
                        result.item.publicNotes
                      }}</span>
                    }
                  </span>
                  <span class="wh__side">
                    @if (price(result); as price) {
                      <span class="wh__price" data-testid="holder-price">{{ price }}</span>
                    }
                    <span class="wh__copies">×{{ result.item.quantity }}</span>
                  </span>
                  @if (canMessage(result)) {
                    <button
                      type="button"
                      class="wh__message"
                      data-testid="holder-message"
                      [attr.tabindex]="active ? 0 : -1"
                      [attr.aria-label]="messageLabel(handle, cardName())"
                      [disabled]="
                        !!result.collector.id && drawer.starting() === result.collector.id
                      "
                      (click)="message($event, result)"
                    >
                      <app-shell-icon name="messages" [size]="18" />
                      Message
                    </button>
                  }
                </li>
              }
            </ul>
          </section>
        }
      </div>
      @if (hasMore()) {
        <button
          type="button"
          class="wh__more"
          data-testid="who-has-more"
          [disabled]="status() === 'loading'"
          (click)="loadMore()"
        >
          {{ status() === 'loading' ? 'Loading…' : 'Load more' }}
        </button>
      }
      @if (status() === 'error') {
        <p class="wh__more-error" role="alert">
          More holders could not load.
          <button type="button" class="wh__retry" (click)="loadMore()">Try again</button>
        </p>
      }
    }
  `,
  styleUrl: './who-has.component.scss',
  host: { '(document:keydown.escape)': 'onDocumentEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhoHasComponent {
  private readonly api = inject(SearchService);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly drawer = inject(ChatDrawer);
  private readonly guest = inject(GuestActions);
  private readonly document = inject(DOCUMENT);

  readonly cardId = input.required<string>();
  /** One printing ("Any printing" when null). */
  readonly printingId = input<string | null>(null);
  /** Any printing of one rarity (a wish of that kind). */
  readonly rarity = input<string | null>(null);
  readonly cardName = input('');
  /**
   * The level of the province headings: one below the heading of the list ("Who has this card"
   * is an h2 on the card page, an h3 in Search's holder pane: WD review A21).
   */
  readonly groupLevel = input(3);
  /** The card's own game: sent as `game=` with the card (WD review P5; the card decides it). */
  readonly game = input<string | null>(null);
  readonly region = input.required<string>();
  readonly regionName = input('');
  readonly viewer = input<ViewerPlace>({ subdivisionCode: null, countryCode: null });
  /** Show "Also in a deck core" (the card page; the holder pane too). */
  readonly showDeckCores = input(true);
  /** The empty state offers "Add to wishlist". */
  readonly offerWish = input(true);
  /** The card is already on the viewer's wishlist: the empty state says so instead. */
  readonly wished = input(false);
  /** Prefix of the group anchors (two lists may share a page). */
  readonly prefix = input('wh');
  /** Where the group headers stick (64 under the top bar on the card page, 0 in a pane). */
  readonly stickyTop = input(64);
  readonly wishRequested = output<void>();

  protected readonly bones = [0, 1, 2, 3, 4, 5];
  protected readonly messageLabel = messageLabel;
  protected readonly status = signal<Status>('loading');
  protected readonly rows = signal<CardHolderResult[]>([]);
  protected readonly deckCores = signal<PublicBinderSummary[]>([]);
  protected readonly activeId = signal<string | null>(null);
  /**
   * The rows whose full-note tooltip Esc dismissed, each until the pointer or the focus leaves
   * that row: one Esc hides the focused row's and the hovered row's at once (SC 1.4.13; WD review
   * R2-1).
   */
  protected readonly tipsOff = signal<ReadonlySet<string>>(new Set());
  /** The row with a note under the pointer: its tooltip shows without the focus. */
  protected hoveredTip: string | null = null;
  private readonly page = signal(0);
  private readonly totalPages = signal(0);
  private readonly error = signal<ApiError | null>(null);
  private request = 0;
  private subscriptions: Subscription[] = [];

  protected readonly groups = computed<HolderGroup[]>(() =>
    groupHolders(this.rows(), this.viewer()),
  );
  protected readonly hasMore = computed(() => this.page() + 1 < this.totalPages());

  constructor() {
    effect(() => {
      const key = [this.cardId(), this.printingId(), this.rarity(), this.region(), this.game()];
      untracked(() => {
        void key;
        this.reload();
      });
    });
    // The first row is the list's tab stop until another one is focused.
    effect(() => {
      const rows = this.rows();
      untracked(() => {
        if (!rows.some((row) => row.item.id === this.activeId())) {
          this.activeId.set(rows[0]?.item.id ?? null);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.subscriptions.forEach((sub) => sub.unsubscribe()));
  }

  reload(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];
    this.rows.set([]);
    this.deckCores.set([]);
    this.page.set(0);
    this.totalPages.set(0);
    this.fetch(0);
    if (this.showDeckCores()) {
      this.subscriptions.push(
        this.api
          .searchDeckCores(
            {
              cardId: this.cardId(),
              region: this.region(),
              limit: WHO_HAS_DECK_CORES,
              ...this.gameParam(),
            },
            'body',
            false,
            { context: silentErrors() },
          )
          .subscribe({
            next: (cores) => this.deckCores.set((cores ?? []).slice(0, WHO_HAS_DECK_CORES)),
            // The banner is a bonus: the list stays when it fails.
            error: () => this.deckCores.set([]),
          }),
      );
    }
  }

  private gameParam(): { game?: string } {
    const game = this.game();
    return game ? { game } : {};
  }

  protected loadMore(): void {
    if (this.status() === 'loading') {
      return;
    }
    this.fetch(this.rows().length === 0 ? 0 : this.page() + 1);
  }

  private fetch(page: number): void {
    const request = ++this.request;
    this.status.set('loading');
    this.error.set(null);
    const printingId = this.printingId();
    this.subscriptions.push(
      this.api
        .searchCardHolders(
          {
            ...(printingId ? { printingId } : { cardId: this.cardId() }),
            ...(this.rarity() && !printingId ? { rarity: this.rarity() as string } : {}),
            region: this.region(),
            ...this.gameParam(),
            sort: 'province',
            excludeDeckCoreItems: true,
            page,
            size: WHO_HAS_PAGE_SIZE,
          },
          'body',
          false,
          { context: silentErrors() },
        )
        .subscribe({
          next: (result) => {
            if (request !== this.request) {
              return;
            }
            const items = result.items ?? [];
            this.rows.set(page === 0 ? items : [...this.rows(), ...items]);
            this.page.set(result.page ?? page);
            this.totalPages.set(result.totalPages ?? 0);
            this.status.set('ready');
          },
          error: (error: unknown) => {
            if (request !== this.request) {
              return;
            }
            this.error.set(toApiError(error));
            this.status.set('error');
          },
        }),
    );
  }

  protected anchor(group: HolderGroup): string {
    return groupAnchor(this.prefix(), group.key);
  }

  protected noteId(result: CardHolderResult): string {
    return `${this.prefix()}-note-${result.item.id}`;
  }

  protected code(result: CardHolderResult): string {
    return printingCode(result.item.printing);
  }

  protected price(result: CardHolderResult): string | null {
    return holderPrice(result);
  }

  /** "duelist.jp, Quebec, RA01-EN008 · Secret Rare, $32, 2 copies" (the note is the description). */
  protected rowLabel(result: CardHolderResult): string {
    const price = itemPriceText(result.item);
    const copies = `${result.item.quantity} ${result.item.quantity === 1 ? 'copy' : 'copies'}`;
    return [
      result.collector.handle ?? 'A collector',
      result.collector.place.subdivisionName,
      holderLine(result.item.printing),
      price,
      copies,
    ]
      .filter(Boolean)
      .join(', ');
  }

  /** A member, about someone else's copy; a guest's Message asks them to sign in (R15). */
  protected canMessage(result: CardHolderResult): boolean {
    const id = result.collector.id;
    return !id || id !== this.session.me()?.id;
  }

  protected message(event: Event, result: CardHolderResult): void {
    event.stopPropagation();
    if (!this.auth.isAuthenticated() || !result.collector.id) {
      // A guest: the sign-in dialog, the chat about this copy after (spec 14).
      void this.guest.ask(
        { kind: 'message', listing: { itemId: result.item.id } },
        cardSubject(
          {
            name: this.cardName() || result.item.card.name,
            imageUrl: printingImageUrl(result.item.printing),
            game: this.game(),
          },
          guestPlace(result.collector.place),
          itemPriceText(result.item),
        ),
        event.currentTarget,
      );
      return;
    }
    void this.drawer.message(
      { recipientId: result.collector.id, subjectItemId: result.item.id },
      event.currentTarget,
    );
  }

  protected onRowClick(event: MouseEvent, result: CardHolderResult): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('a, button')) {
      return;
    }
    this.openRow(result);
  }

  /**
   * Esc anywhere hides the full-note tooltip of the row under the pointer, the focus wherever it
   * is (SC 1.4.13; WD review R1-4). A focused row handles its own Esc first (`dismissTip`).
   */
  protected onDocumentEscape(): void {
    this.hideTips([this.hoveredTip]);
  }

  /**
   * Esc on a row hides its full-note tooltip and the hovered row's in one go (WD review R2-1);
   * when both were already hidden the Esc goes on to the page (a drawer).
   */
  protected dismissTip(event: Event, result: CardHolderResult): void {
    const own = result.item.publicNotes ? result.item.id : null;
    if (this.hideTips([own, this.hoveredTip])) {
      event.stopPropagation();
    }
  }

  /** The pointer or the focus left a row: its tooltip may show again. */
  protected tipOn(id: string): void {
    if (this.tipsOff().has(id)) {
      const next = new Set(this.tipsOff());
      next.delete(id);
      this.tipsOff.set(next);
    }
  }

  /** Hides these rows' tooltips; true when one of them was showing. */
  private hideTips(ids: (string | null)[]): boolean {
    const off = this.tipsOff();
    const fresh = ids.filter((id): id is string => !!id && !off.has(id));
    if (fresh.length === 0) {
      return false;
    }
    this.tipsOff.set(new Set([...off, ...fresh]));
    return true;
  }

  /** Enter on a row (not on its link or button) opens the holder's profile. */
  protected onRowEnter(event: Event, result: CardHolderResult): void {
    if (event.target === event.currentTarget) {
      event.preventDefault();
      this.openRow(result);
    }
  }

  private openRow(result: CardHolderResult): void {
    const handle = result.collector.handle;
    if (!handle) {
      // A guest's row: "Sign in to see collector profiles", the profile after (spec 14).
      void this.guest.ask(
        { kind: 'profile', listing: { itemId: result.item.id } },
        personSubject(guestPlace(result.collector.place)),
        this.document.activeElement,
      );
      return;
    }
    void this.router.navigate(['/collectors', handle]);
  }

  /** "Jump to": scrolls to the group and moves the focus to its header. */
  protected jump(group: HolderGroup): void {
    const header = this.host.nativeElement.querySelector<HTMLElement>(`#${this.anchor(group)}`);
    header?.scrollIntoView({ block: 'start' });
    header?.focus({ preventScroll: true });
  }

  /** Roving tabindex over the rows: ↑↓ or j k, Home, End; Enter opens the profile. */
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>('.wh__row');
    if (!row) {
      return;
    }
    const rows = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.wh__row'));
    const index = rows.indexOf(row);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        next = Math.min(index + 1, rows.length - 1);
        break;
      case 'ArrowUp':
      case 'k':
        next = Math.max(index - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = rows.length - 1;
        break;
      default:
        return;
    }
    if (target !== row && (event.key === 'j' || event.key === 'k')) {
      return;
    }
    event.preventDefault();
    const nextRow = rows[next];
    if (nextRow) {
      this.activeId.set(nextRow.dataset['item'] ?? null);
      nextRow.focus();
    }
  }
}
