import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import type { PublicBinderResponse, PublicInventoryItem } from '@orenji/api-client';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import {
  BinderViewStore,
  binderLimitMessage,
  updatedLabel,
} from '../../../shared/discovery/binder-view/binder-view.store';
import {
  BinderCardsComponent,
  BinderOwnerComponent,
  KeyCardsComponent,
  ratingText,
} from '../../../shared/discovery/binder-view/binder-parts.component';
import { DeckCoreGalleryComponent } from '../../../shared/discovery/binder-view/deck-core-gallery.component';
import { gameInfo } from '../../../shared/domain/games';
import { ChatDrawer } from '../../../shared/messaging/chat-drawer.service';
import { ReportActionsService } from '../../../shared/reports/report-actions.service';

/**
 * A binder or deck core opened beside Search's list (spec 6.5, board W5): at lg the list pane
 * widens to 520 and shows it under "← Back to results"; at xl it is the middle pane. Opening it is
 * the explicit open that spends one public binder view (decision 14); nothing here is read on
 * hover or prefetch. A deck core: its photos (472, thumbnails of 64), the tags, the name, the
 * price, the seller row, the note and the key cards as chips, and a sticky bar with [Message …]
 * and "Open full page ↗". A binder: the name, the owner row and province, "Search this binder" and
 * a 3-column grid. At the limit: "You've opened 30 public binders today. …".
 */
@Component({
  selector: 'app-binder-drill-in',
  imports: [
    RouterLink,
    MatMenuModule,
    BinderCardsComponent,
    BinderOwnerComponent,
    DeckCoreGalleryComponent,
    KeyCardsComponent,
    ShellIconComponent,
  ],
  providers: [BinderViewStore],
  template: `
    @let state = store.state();
    <section class="di" aria-labelledby="drill-in-title" data-testid="binder-drill-in">
      <header class="di__head">
        <button type="button" class="di__back" data-testid="drill-in-back" (click)="back.emit()">
          <app-shell-icon name="arrowLeft" [size]="18" />
          Back to results
        </button>
        <span class="di__where">{{ where() }}</span>
        @if (binder(); as binder) {
          <button type="button" class="di__more" aria-label="More actions" [matMenuTriggerFor]="menu">
            <app-shell-icon name="more" [size]="18" />
          </button>
          <mat-menu #menu="matMenu" xPosition="before">
            <a mat-menu-item [routerLink]="['/binders', binder.id]">
              <app-shell-icon name="external" [size]="20" /> Open full page
            </a>
            @if (!isOwn()) {
              <button mat-menu-item type="button" (click)="report(binder)">
                <app-shell-icon name="flag" [size]="20" /> Report {{ binder.name }}
              </button>
            }
          </mat-menu>
        }
      </header>
      <div class="di__body">
        @switch (state.kind) {
          @case ('loading') {
            <div aria-busy="true">
              <span class="visually-hidden" role="status">Opening</span>
              <span class="di__bone di__bone--photo" aria-hidden="true"></span>
              <span class="di__bone di__bone--line" aria-hidden="true"></span>
              <span class="di__bone di__bone--line" aria-hidden="true"></span>
            </div>
            <h2 class="visually-hidden" id="drill-in-title">Opening</h2>
          }
          @case ('limit') {
            <h2 class="di__state-title" id="drill-in-title">No more binders today</h2>
            <p class="di__state" role="status" data-testid="binder-limit">{{ limit() }}</p>
          }
          @case ('not-found') {
            <h2 class="di__state-title" id="drill-in-title">This binder isn't public anymore.</h2>
          }
          @case ('error') {
            <h2 class="di__state-title" id="drill-in-title">This binder could not load</h2>
            <p class="di__state" role="alert">{{ error() }}</p>
            <button type="button" class="di__retry" (click)="store.open(binderId())">Try again</button>
          }
          @case ('ready') {
            @if (binder(); as binder) {
              @if (binder.sellsAsCore) {
                <app-deck-core-gallery [compact]="true" [photos]="binder.photos ?? []" [name]="binder.name" />
                <div class="di__tags">
                  <span class="di__tag di__tag--core"
                    ><app-shell-icon name="layers" [size]="14" /> Deck core</span
                  >
                  @if (game()) {
                    <span class="di__tag">{{ gameLabel() }}</span>
                  }
                  <span class="di__facts">{{ facts() }}</span>
                </div>
                <div class="di__title-row">
                  <h2 class="di__name" id="drill-in-title">{{ binder.name }}</h2>
                  @if (binder.askingPriceText) {
                    <span class="di__price">{{ binder.askingPriceText }}</span>
                  }
                </div>
                <a
                  class="di__seller"
                  [routerLink]="binder.owner.handle ? ['/collectors', binder.owner.handle] : null"
                >
                  <app-binder-owner
                    [owner]="binder.owner"
                    [rating]="rating()"
                    [binderCount]="binder.ownerPublicBinderCount"
                  />
                  <app-shell-icon class="di__muted" name="chevronRight" [size]="18" />
                </a>
                @if (binder.description) {
                  <p class="di__note">{{ binder.description }}</p>
                }
                @if ((binder.keyCards ?? []).length > 0) {
                  <h3 class="di__label">Key cards</h3>
                  <app-key-cards [chips]="true" [cards]="binder.keyCards ?? []" [game]="game()" />
                }
              } @else {
                <h2 class="di__name" id="drill-in-title">{{ binder.name }}</h2>
                <p class="di__facts di__facts--binder">{{ facts() }}</p>
                <app-binder-owner
                  [owner]="binder.owner"
                  [rating]="rating()"
                  [binderCount]="binder.ownerPublicBinderCount"
                />
                <label class="di__search">
                  <app-shell-icon class="di__muted" name="search" [size]="18" />
                  <input
                    #search
                    type="search"
                    autocomplete="off"
                    maxlength="100"
                    placeholder="Search this binder"
                    aria-label="Search this binder"
                    (input)="onSearch(search.value)"
                  />
                </label>
                @if (store.itemsState() === 'error' && store.items().length === 0) {
                  <p class="di__state" role="alert">
                    The cards could not load.
                    <button type="button" class="di__retry" (click)="store.retryItems()">Try again</button>
                  </p>
                } @else if (store.itemsState() === 'loading' && store.items().length === 0) {
                  <span class="di__bone di__bone--grid" aria-hidden="true"></span>
                } @else if (store.items().length === 0) {
                  <p class="di__state">
                    {{ store.query() ? 'No card in this binder matches.' : 'No public cards right now.' }}
                  </p>
                } @else {
                  <app-binder-cards
                    [columns]="3"
                    [items]="store.items()"
                    [canMessage]="!isOwn()"
                    (message)="messageAbout(binder, $event.item, $event.opener)"
                  />
                  @if (store.hasMore()) {
                    <button type="button" class="di__retry di__more-cards" (click)="store.loadMore()">
                      Load more
                    </button>
                  }
                }
              }
            }
          }
        }
      </div>
      @if (binder(); as binder) {
        <footer class="di__bar">
          @if (isOwn()) {
            <a class="di__own" routerLink="/inventory" [queryParams]="{ binder: binder.id }"
              >Manage in Inventory</a
            >
          } @else {
            <button
              type="button"
              class="di__message"
              data-testid="drill-in-message"
              (click)="message(binder, $event.currentTarget)"
            >
              <app-shell-icon name="messages" [size]="18" />
              Message {{ binder.owner.handle || 'the seller' }}
            </button>
          }
          <a class="di__full" [routerLink]="['/binders', binder.id]"
            >Open full page <app-shell-icon name="external" [size]="16"
          /></a>
        </footer>
      }
    </section>
  `,
  styleUrl: './binder-drill-in.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderDrillInComponent {
  protected readonly store = inject(BinderViewStore);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly chatDrawer = inject(ChatDrawer);
  private readonly reports = inject(ReportActionsService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly binderId = input.required<string>();
  /** "Deck cores · Quebec" (the list it came from). */
  readonly where = input('');
  readonly back = output<void>();

  protected readonly binder = this.store.binder;
  protected readonly game = computed(() => this.binder()?.games?.[0] ?? null);
  protected readonly gameLabel = computed(() => gameInfo(this.game() ?? '').label);
  protected readonly rating = computed(() => ratingText(this.store.rating()));
  protected readonly isOwn = computed(() => {
    const me = this.session.me()?.id;
    return !!me && this.binder()?.owner?.id === me;
  });
  protected readonly facts = computed(() => {
    const binder = this.binder();
    if (!binder) {
      return '';
    }
    const cards = `${binder.itemCount} ${binder.itemCount === 1 ? 'card' : 'cards'}`;
    return [cards, updatedLabel(binder.freshness?.updatedAt)].filter(Boolean).join(' · ');
  });
  protected readonly limit = computed(() => {
    const state = this.store.state();
    return state.kind === 'limit' ? binderLimitMessage(state.info) : '';
  });
  protected readonly error = computed(() => {
    const state = this.store.state();
    return state.kind === 'error' ? friendlyMessage(state.error) : '';
  });
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // The explicit open (a click or Enter on a row): the one read that spends a view.
    effect(() => {
      const id = this.binderId();
      untracked(() => void this.store.open(id));
    });
    afterNextRender(() =>
      this.host.nativeElement.querySelector<HTMLElement>('[data-testid="drill-in-back"]')?.focus(),
    );
    inject(DestroyRef).onDestroy(() => {
      this.store.close();
      if (this.searchTimer) {
        clearTimeout(this.searchTimer);
      }
    });
  }

  protected onSearch(value: string): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.store.setFilters(value.trim(), 'recent'), 300);
  }

  protected message(binder: PublicBinderResponse, opener: EventTarget | null): void {
    if (!this.auth.isAuthenticated() || !binder.owner?.id) {
      this.signIn();
      return;
    }
    void this.chatDrawer.message(
      {
        recipientId: binder.owner.id,
        ...(binder.sellsAsCore ? { subjectBinderId: binder.id } : {}),
      },
      opener,
    );
  }

  protected messageAbout(
    binder: PublicBinderResponse,
    item: PublicInventoryItem,
    opener: EventTarget | null,
  ): void {
    if (!this.auth.isAuthenticated() || !binder.owner?.id) {
      this.signIn();
      return;
    }
    void this.chatDrawer.message({ recipientId: binder.owner.id, subjectItemId: item.id }, opener);
  }

  protected async report(binder: PublicBinderResponse): Promise<void> {
    if (!this.auth.isAuthenticated() || !binder.owner?.id) {
      this.signIn();
      return;
    }
    await this.reports.report(
      {
        id: binder.owner.id,
        displayName: binder.owner.displayName,
        handle: binder.owner.handle,
        avatarUrl: binder.owner.avatarUrl,
      },
      { source: 'BINDER', binderId: binder.id },
    );
  }

  private signIn(): void {
    void this.router.navigate(['/auth/sign-in'], { queryParams: { returnUrl: this.router.url } });
  }
}
