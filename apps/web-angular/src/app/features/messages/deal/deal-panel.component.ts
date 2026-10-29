import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  CollectorProfileResponse,
  CollectorsService,
  ConversationSummary,
  InventoryItemResponse,
  InventoryService,
  MessageResponse,
  PublicBindersService,
  PublicInventoryItem,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import { printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { itemPriceText } from '../../inventory/data/item-price';
import { DEAL_COPY } from '../data/chat-copy';
import {
  DealSide,
  canUndoSale,
  latestSale,
  monthDay,
  provinceOf,
  subjectPrice,
} from '../data/deal-rules';

/** Tiles of "More from {seller}" (spec 10.4: four, no counts). */
const MORE_TILES = 4;

type Load<T> = { state: 'idle' | 'loading' | 'error' } | { state: 'ready'; value: T };

/**
 * The deal panel (320, `surface`, left border, padding 20; spec 10.4, boards W18 to W20), beside
 * the chat at lg and in a drawer at md:
 * - "THIS CHAT IS ABOUT": 96×140 art, the name, code, price and "View card" (or the deck core);
 * - the seller: "Your copies ×2 · Public · {binder}" with "Open in Inventory"; after the sale
 *   "Sold Oct 20 · Tracking …", Undo while its 10 minutes last and [Rate {buyer}];
 * - the buyer: "How deals work here" (four steps) and "OrenjiTrade never holds the money and does
 *   not protect payments." with Trading safely; after the sale "{seller} marked it sold to you ·
 *   Tracking …" and [Rate {seller}];
 * - "WITH": the other collector's avatar, handle, rating, state or province (never a city),
 *   "Member since" and "View profile", where a buyer checks a rating before paying;
 * - the buyer only: "More from {seller}", four tiles of 64 of their public cards (no counts, an
 *   existing endpoint that answers a block as not found) with "See all"; a tile puts "Could you
 *   add your {card} ({price}) to the same package?" in the composer;
 * - without a subject: the collector block and "Share a card from your inventory".
 */
@Component({
  selector: 'app-deal-panel',
  imports: [RouterLink, MatIconModule, AvatarComponent, CardImageComponent, SkeletonComponent],
  template: `
    @let c = conversation();
    <div class="deal" data-testid="deal-panel">
      @if (closable()) {
        <div class="deal__top">
          <span class="deal__heading">{{ copy.label }}</span>
          <button
            type="button"
            class="deal__close"
            [attr.aria-label]="copy.closeDeal"
            (click)="closed.emit()"
          >
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </div>
      }

      @if (c.subject; as s) {
        <section class="deal__section" aria-labelledby="deal-about">
          <div class="deal__row">
            <h2 class="deal__label" id="deal-about">{{ copy.about }}</h2>
          </div>
          <div class="about">
            <a
              class="about__art"
              [routerLink]="subjectLink()"
              [queryParams]="subjectQuery()"
              tabindex="-1"
              aria-hidden="true"
            >
              <app-card-image size="fill" [src]="s.imageUrl" alt="" />
            </a>
            <div class="about__text">
              <span class="about__name">{{ s.name }}</span>
              @if (s.kind === 'CARD' && s.printingCode) {
                <span class="about__code mono">{{ s.printingCode }}</span>
              }
              @if (s.kind === 'CARD' && s.rarity) {
                <span class="about__muted">{{ s.rarity }}</span>
              }
              @if (s.kind === 'DECK_CORE') {
                <span class="about__tag">Deck core</span>
              }
              @if (price()) {
                <span class="about__price">{{ price() }}</span>
              }
              <a class="teal" [routerLink]="subjectLink()" [queryParams]="subjectQuery()">
                {{ s.kind === 'DECK_CORE' ? copy.viewDeckCore : copy.viewCard }}
              </a>
            </div>
          </div>
        </section>

        @if (side() === 'selling') {
          <section class="deal__box" aria-label="Your copies">
            @if (sale(); as sold) {
              <p class="sold" data-testid="deal-sold">
                <span class="sold__line">{{ soldLine() }}</span>
                @if (sold.payload.sale?.trackingNumber; as tracking) {
                  <span class="sold__tracking"
                    >{{ copy.tracking }} <span class="mono">{{ tracking }}</span></span
                  >
                }
              </p>
              <div class="deal__actions">
                @if (undoOpen()) {
                  <button
                    type="button"
                    class="btn btn--quiet"
                    data-testid="deal-undo"
                    (click)="undo.emit(sold.payload.sale!.saleId)"
                  >
                    {{ saleUndo }}
                  </button>
                }
                @if (canRate()) {
                  <button type="button" class="btn btn--teal" (click)="rate.emit()">
                    {{ rateLabel() }}
                  </button>
                }
              </div>
            } @else if (s.kind === 'CARD') {
              @switch (item().state) {
                @case ('loading') {
                  <app-skeleton variant="list" lines="2" />
                }
                @case ('error') {
                  <p class="deal__muted">
                    {{ copy.copiesUnknown }}
                    <button type="button" class="link-btn" (click)="loadItem()">Try again</button>
                  </p>
                }
                @default {
                  <dl class="facts">
                    <div class="facts__row">
                      <dt>{{ copy.yourCopies }}</dt>
                      <dd class="facts__strong">×{{ s.copies ?? 0 }}</dd>
                    </div>
                    @if (ownItem(); as own) {
                      <div class="facts__row">
                        <dt>{{ copy.visibility }}</dt>
                        <dd>
                          <span class="vis" [class.vis--public]="own.effectivePublic">{{
                            visibility(own)
                          }}</span>
                        </dd>
                      </div>
                      <div class="facts__row">
                        <dt>{{ copy.binder }}</dt>
                        <dd>{{ own.binder?.name ?? copy.unfiled }}</dd>
                      </div>
                    }
                  </dl>
                  <a
                    class="teal"
                    routerLink="/inventory"
                    [queryParams]="{ item: s.id }"
                    data-testid="open-in-inventory"
                  >
                    {{ copy.openInInventory }} →
                  </a>
                }
              }
            } @else {
              <a class="teal" routerLink="/inventory" [queryParams]="{ tab: 'binders' }">
                {{ copy.openInInventory }} →
              </a>
            }
          </section>
        } @else {
          @if (sale(); as sold) {
            <section class="deal__box" aria-label="The sale">
              <p class="sold" data-testid="deal-sold">
                <span class="sold__line">{{ copy.soldToYou(c.other.handle) }}</span>
                @if (sold.payload.sale?.trackingNumber; as tracking) {
                  <span class="sold__tracking"
                    >{{ copy.tracking }} <span class="mono">{{ tracking }}</span></span
                  >
                }
              </p>
              @if (canRate()) {
                <div class="deal__actions">
                  <button type="button" class="btn btn--teal" (click)="rate.emit()">
                    {{ rateLabel() }}
                  </button>
                </div>
              }
            </section>
          }
          <section class="deal__section" aria-labelledby="deal-how">
            <h2 class="deal__label" id="deal-how">{{ copy.howDeals }}</h2>
            <ol class="steps">
              @for (step of copy.steps; track step; let i = $index) {
                <li>
                  <span class="steps__n" aria-hidden="true">{{ i + 1 }}</span>
                  <span>{{ step }}</span>
                </li>
              }
            </ol>
            <p class="shield">
              <mat-icon aria-hidden="true">shield</mat-icon>
              <span
                >{{ copy.noProtection }}
                <a class="teal" routerLink="/legal/trading-safely">{{
                  copy.tradingSafely
                }}</a></span
              >
            </p>
          </section>
        }
      } @else {
        <section class="deal__section" aria-labelledby="deal-none">
          <h2 class="deal__label" id="deal-none">{{ copy.about }}</h2>
          <p class="deal__muted">{{ copy.noSubject }} {{ copy.noSubjectHint }}</p>
          <button type="button" class="btn btn--outline" (click)="shareCard.emit()">
            {{ copy.shareCard }}
          </button>
        </section>
      }

      <section class="deal__section" aria-labelledby="deal-with">
        <div class="deal__row">
          <h2 class="deal__label" id="deal-with">{{ copy.with }}</h2>
          <a
            class="teal teal--sm"
            [routerLink]="['/collectors', c.other.handle]"
            [attr.aria-label]="copy.viewProfileOf(c.other.handle)"
            >{{ copy.viewProfile }}</a
          >
        </div>
        <div class="with">
          <span class="with__avatar">
            <app-avatar
              size="md"
              [src]="c.other.avatarUrl"
              [name]="c.other.displayName"
              [decorative]="true"
            />
            @if (c.other.onlineStatus === 'ONLINE') {
              <span class="with__online" aria-hidden="true"></span>
            }
          </span>
          <span class="with__text">
            <span class="with__handle">{{ c.other.handle }}</span>
            @switch (profile().state) {
              @case ('loading') {
                <app-skeleton width="120px" height="14px" />
              }
              @case ('ready') {
                @if (ratingText(); as rating) {
                  <span class="with__rating" role="img" [attr.aria-label]="ratingLabel()">
                    <span aria-hidden="true">{{ rating }}</span>
                  </span>
                } @else {
                  <span class="with__muted">{{ copy.noRatings }}</span>
                }
              }
            }
            @if (place()) {
              <span class="with__muted">{{ place() }}</span>
            }
            @if (memberSince(); as since) {
              <span class="with__muted">{{ since }}</span>
            }
          </span>
        </div>
      </section>

      @if (side() === 'buying' && c.subject) {
        @switch (more().state) {
          @case ('loading') {
            <section class="deal__section" aria-busy="true">
              <app-skeleton width="60%" height="14px" />
              <div class="tiles">
                @for (n of [1, 2, 3, 4]; track n) {
                  <app-skeleton width="64px" height="90px" />
                }
              </div>
            </section>
          }
          @case ('error') {
            <section class="deal__section">
              <p class="deal__muted">
                {{ copy.moreFrom(c.other.handle) }}
                <button type="button" class="link-btn" (click)="loadMore()">Try again</button>
              </p>
            </section>
          }
          @case ('ready') {
            @if (moreTiles().length) {
              <section class="deal__section" aria-labelledby="deal-more" data-testid="more-from">
                <div class="deal__row">
                  <h2 class="deal__label deal__label--case" id="deal-more">
                    {{ copy.moreFrom(c.other.handle) }}
                  </h2>
                  <a
                    class="teal teal--sm"
                    [routerLink]="['/collectors', c.other.handle]"
                    [attr.aria-label]="copy.seeAllLabel(c.other.handle)"
                    >{{ copy.seeAll }}</a
                  >
                </div>
                <div class="tiles">
                  @for (tile of moreTiles(); track tile.id) {
                    <button
                      type="button"
                      class="tile"
                      [attr.aria-label]="copy.askTile(tile.name, tile.price, c.other.handle)"
                      [title]="tile.name"
                      (click)="ask.emit(copy.askDraft(tile.name, tile.price))"
                    >
                      <app-card-image class="tile__art" size="fill" [src]="tile.imageUrl" alt="" />
                      @if (tile.price) {
                        <span class="tile__price">{{ tile.price }}</span>
                      }
                    </button>
                  }
                </div>
                <p class="deal__hint">{{ copy.moreHint }}</p>
              </section>
            }
          }
        }
      }
    </div>
  `,
  styleUrl: './deal-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealPanelComponent {
  private readonly collectors = inject(CollectorsService);
  private readonly inventory = inject(InventoryService);
  private readonly publicBinders = inject(PublicBindersService);

  readonly conversation = input.required<ConversationSummary>();
  readonly side = input.required<DealSide>();
  readonly messages = input<readonly MessageResponse[]>([]);
  readonly selfId = input<string | null>(null);
  readonly canRate = input(false);
  readonly now = input(Date.now());
  /** In a drawer (md): a header with Close. */
  readonly closable = input(false);
  readonly rate = output<void>();
  readonly undo = output<string>();
  readonly shareCard = output<void>();
  /** A "More from" tile: the question to put in the composer. */
  readonly ask = output<string>();
  readonly closed = output<void>();

  protected readonly copy = { ...DEAL_COPY, closeDeal: 'Close the deal panel' };
  protected readonly saleUndo = 'Undo';

  protected readonly profile = signal<Load<CollectorProfileResponse>>({ state: 'idle' });
  protected readonly item = signal<Load<InventoryItemResponse>>({ state: 'idle' });
  protected readonly more = signal<Load<PublicInventoryItem[]>>({ state: 'idle' });
  private readonly requests: Subscription[] = [];
  private profileFor: string | null = null;
  private itemFor: string | null = null;
  private moreFor: string | null = null;

  protected readonly price = computed(() => {
    const s = this.conversation().subject;
    return s ? subjectPrice(s) : null;
  });
  protected readonly sale = computed(() =>
    this.conversation().subject?.sold ? latestSale(this.messages()) : null,
  );
  protected readonly soldLine = computed(() => {
    const sale = this.sale();
    return sale ? DEAL_COPY.soldOn(monthDay(sale.createdAt)) : DEAL_COPY.sold;
  });
  protected readonly undoOpen = computed(() => {
    const sale = this.sale();
    return !!sale && canUndoSale(sale, this.selfId(), this.now());
  });
  protected readonly rateLabel = computed(() => `Rate ${this.conversation().other.handle}`);
  protected readonly place = computed(() => {
    const other = this.conversation().other;
    const province = provinceOf(other);
    if (!province) {
      return null;
    }
    const place = other.place;
    return place && place.subdivisionCode !== place.countryCode
      ? `${province}, ${place.countryName}`
      : province;
  });
  protected readonly ownItem = computed(() => {
    const item = this.item();
    return item.state === 'ready' ? item.value : null;
  });
  protected readonly ratingText = computed(() => {
    const profile = this.profile();
    if (profile.state !== 'ready' || !profile.value.rating.count) {
      return null;
    }
    const average = (profile.value.rating.average ?? 0).toFixed(1);
    return DEAL_COPY.rating(average, profile.value.rating.count);
  });
  protected readonly ratingLabel = computed(() => {
    const profile = this.profile();
    if (profile.state !== 'ready') {
      return '';
    }
    return DEAL_COPY.ratingLabel(
      (profile.value.rating.average ?? 0).toFixed(1),
      profile.value.rating.count,
    );
  });
  protected readonly memberSince = computed(() => {
    const profile = this.profile();
    if (profile.state !== 'ready') {
      return null;
    }
    const year = new Date(profile.value.memberSince).getFullYear();
    return Number.isFinite(year) ? DEAL_COPY.memberSince(year) : null;
  });
  protected readonly moreTiles = computed(() => {
    const more = this.more();
    if (more.state !== 'ready') {
      return [];
    }
    const subjectId = this.conversation().subject?.id;
    return more.value
      .filter((item) => item.id !== subjectId)
      .slice(0, MORE_TILES)
      .map((item) => ({
        id: item.id,
        name: item.card.name,
        price: itemPriceText(item),
        imageUrl: printingImageUrl(item.printing),
      }));
  });
  protected readonly subjectLink = computed(() => {
    const s = this.conversation().subject;
    if (!s) {
      return null;
    }
    return s.kind === 'DECK_CORE' ? ['/binders', s.id] : s.cardId ? ['/cards', s.cardId] : null;
  });
  protected readonly subjectQuery = computed(() => {
    const s = this.conversation().subject;
    return s?.kind === 'CARD' && s.printingId ? { printing: s.printingId } : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.requests.forEach((r) => r.unsubscribe()));
    effect(() => {
      const c = this.conversation();
      const side = this.side();
      untracked(() => {
        this.loadProfile(c.other.handle);
        if (side === 'selling' && c.subject?.kind === 'CARD') {
          this.loadItem();
        }
        if (side === 'buying' && c.subject) {
          this.loadMore();
        }
      });
    });
  }

  protected visibility(item: InventoryItemResponse): string {
    if (item.visibility === 'PRIVATE') {
      return DEAL_COPY.private;
    }
    return item.visibility === 'TEMPORARILY_PUBLIC'
      ? DEAL_COPY.temporarilyPublic
      : DEAL_COPY.public;
  }

  private loadProfile(handle: string): void {
    if (this.profileFor === handle) {
      return;
    }
    this.profileFor = handle;
    this.profile.set({ state: 'loading' });
    this.requests.push(
      this.collectors
        .getCollector({ handle }, 'body', false, { context: silentErrors() })
        .subscribe({
          next: (value) =>
            this.profileFor === handle && this.profile.set({ state: 'ready', value }),
          // Without the profile the block shows the handle and the place only.
          error: () => this.profileFor === handle && this.profile.set({ state: 'error' }),
        }),
    );
  }

  /** The seller's own card: its visibility and binder (`GET /inventory/items/{id}`). */
  loadItem(): void {
    const subject = this.conversation().subject;
    if (!subject || subject.kind !== 'CARD') {
      return;
    }
    const key = `${subject.id}:${subject.copies ?? ''}`;
    if (this.itemFor === key && this.item().state !== 'error') {
      return;
    }
    this.itemFor = key;
    this.item.set({ state: 'loading' });
    this.requests.push(
      this.inventory
        .getInventoryItem({ id: subject.id }, 'body', false, { context: silentErrors() })
        .subscribe({
          next: (value) => this.itemFor === key && this.item.set({ state: 'ready', value }),
          error: (error: { status?: number }) => {
            if (this.itemFor !== key) {
              return;
            }
            // A card that left the inventory (sold out, deleted): nothing to show but the copies.
            this.item.set(error?.status === 404 ? { state: 'idle' } : { state: 'error' });
          },
        }),
    );
  }

  /** "More from {seller}": their public cards outside deck cores (an existing endpoint). */
  loadMore(): void {
    const handle = this.conversation().other.handle;
    if (this.moreFor === handle && this.more().state !== 'error') {
      return;
    }
    this.moreFor = handle;
    this.more.set({ state: 'loading' });
    this.requests.push(
      this.publicBinders
        .listCollectorInventory(
          { handle, size: MORE_TILES + 1, excludeDeckCoreItems: true },
          'body',
          false,
          { context: silentErrors() },
        )
        .subscribe({
          next: (page) =>
            this.moreFor === handle && this.more.set({ state: 'ready', value: page.items ?? [] }),
          error: (error: { status?: number }) => {
            if (this.moreFor === handle) {
              // 404: their cards are not public to the reader (a private profile): no tiles.
              this.more.set(
                error?.status === 404 ? { state: 'ready', value: [] } : { state: 'error' },
              );
            }
          },
        }),
    );
  }
}
