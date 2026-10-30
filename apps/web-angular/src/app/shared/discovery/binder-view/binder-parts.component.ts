import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  BinderKeyCard,
  CollectorRating,
  PublicBinderOwner,
  PublicInventoryItem,
} from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { itemPriceText } from '../../../features/inventory/data/item-price';
import { printingCode, printingImageUrl } from '../../inventory/inventory-labels';
import { AvatarComponent } from '../../ui/avatar/avatar.component';
import { CardImageComponent } from '../../ui/card-image/card-image.component';

/** "★4.9", or null without a rating. */
export function ratingText(rating: CollectorRating | null | undefined): string | null {
  return rating && rating.count > 0 && typeof rating.average === 'number'
    ? `★${rating.average.toFixed(1)}`
    : null;
}

/** "Quebec · 2 public binders" (the owner's place, never a city, ADR 0017). */
export function ownerLine(
  owner: PublicBinderOwner | null | undefined,
  binders?: number | null,
): string {
  const place = owner?.place?.subdivisionName ?? owner?.place?.label ?? '';
  const count =
    typeof binders === 'number' && binders > 0
      ? `${binders} public ${binders === 1 ? 'binder' : 'binders'}`
      : null;
  return [place, count].filter(Boolean).join(' · ');
}

/**
 * The owner of a binder or deck core (spec 8.1 to 8.3): avatar, "duelist.jp · ★4.9", "Quebec · 2
 * public binders" and "View profile". A guest reads "A collector" with a plain avatar, no handle,
 * rating or link; the province stays (R15).
 */
@Component({
  selector: 'app-binder-owner',
  imports: [RouterLink, AvatarComponent, ShellIconComponent],
  template: `
    @let o = owner();
    <div class="own" [class.own--card]="card()">
      @if (o?.handle) {
        <app-avatar
          class="own__avatar"
          [src]="o?.avatarUrl"
          [name]="o?.displayName || o?.handle"
          [decorative]="true"
        />
      } @else {
        <span class="own__guest" aria-hidden="true"
          ><app-shell-icon name="profile" [size]="20"
        /></span>
      }
      <span class="own__text">
        <span class="own__line1">
          @if (o?.handle && !card() && linked()) {
            <a class="own__handle own__handle--link" [routerLink]="['/collectors', o?.handle]">{{
              o?.handle
            }}</a>
          } @else {
            <span class="own__handle">{{ o?.handle ?? 'A collector' }}</span>
          }
          @if (rating()) {
            <span class="own__rating"><span aria-hidden="true">·</span> {{ rating() }}</span>
          }
        </span>
        <span class="own__line2" data-testid="owner-public-label">{{ line() }}</span>
      </span>
      @if (o?.handle && card()) {
        <a class="own__profile" [routerLink]="['/collectors', o?.handle]">View profile</a>
      } @else if (card() && !o?.handle) {
        <!-- A guest: "View profile" asks to sign in first (spec 14, "Sign in to see collector
          profiles"), then opens the profile. -->
        <button
          type="button"
          class="own__profile own__profile--button"
          aria-label="View profile. Needs an account"
          data-testid="owner-guest-profile"
          (click)="askProfile.emit($event.currentTarget)"
        >
          View profile
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .own {
      display: flex;
      align-items: center;
      gap: 12px;
      --avatar-size: 40px;
    }
    .own--card {
      padding: 14px 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .own__guest {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .own__text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .own__line1 {
      display: flex;
      gap: 6px;
      align-items: baseline;
    }
    .own__handle {
      overflow: hidden;
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .own__handle--link {
      color: var(--color-ink);
      text-decoration: none;
    }
    .own__handle--link:hover {
      text-decoration: underline;
    }
    .own__rating {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      white-space: nowrap;
    }
    .own__line2 {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .own__profile {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
      white-space: nowrap;
    }
    .own__profile:hover {
      text-decoration: underline;
    }
    .own__profile--button {
      padding: 4px 0;
      border: 0;
      background: none;
      font: inherit;
      cursor: pointer;
    }
    .own__profile--button:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderOwnerComponent {
  readonly owner = input<PublicBinderOwner | null | undefined>(null);
  readonly rating = input<string | null>(null);
  readonly binderCount = input<number | null | undefined>(null);
  /** The page's seller card (a surface card with "View profile"). */
  readonly card = input(false);
  /** False inside a row that is itself the profile link (no link in a link, WD review A10). */
  readonly linked = input(true);
  /** A guest's "View profile" on the seller card (the page opens the sign-in dialog). */
  readonly askProfile = output<EventTarget | null>();
  // A guest sees the province only (spec 8.3): no handle, rating, presence or binder count.
  protected readonly line = computed(() =>
    ownerLine(this.owner(), this.owner()?.handle ? this.binderCount() : null),
  );
}

/**
 * The cards of a public binder (spec 8.2, board W9): a grid `auto-fill minmax(136px, 1fr)` (3
 * columns beside Search's list), art at most 160 wide, the name on 2 lines, the price as typed and
 * "×n"; a "Message about this card" button shows on hover or focus; a tile opens Who has this card
 * on that printing.
 */
@Component({
  selector: 'app-binder-cards',
  imports: [RouterLink, CardImageComponent, ShellIconComponent],
  template: `
    <ul class="bc" [class.bc--three]="columns() === 3" aria-label="Cards in this binder">
      @for (item of items(); track item.id) {
        <li class="bc__tile" data-testid="binder-card">
          <a
            class="bc__link"
            [routerLink]="['/cards', item.card.id]"
            [queryParams]="{ printing: item.printing.id }"
            [attr.aria-label]="tileLabel(item)"
          >
            <!-- The link names the card (with its code and price): the art adds nothing. -->
            <app-card-image class="bc__art" [src]="image(item)" alt="" [game]="item.card.game" />
            <span class="bc__name">{{ item.card.name }}</span>
          </a>
          <span class="bc__foot">
            <span class="bc__price">{{ price(item) ?? '' }}</span>
            <span class="bc__copies">×{{ item.quantity }}</span>
          </span>
          @if (canMessage()) {
            <button
              type="button"
              class="bc__message"
              [attr.aria-label]="'Message about ' + item.card.name"
              (click)="messageAbout.emit({ item, opener: $event.currentTarget })"
            >
              <app-shell-icon name="messages" [size]="18" />
            </button>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .bc {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
      gap: 20px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .bc--three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .bc__tile {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .bc__link {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: inherit;
      text-decoration: none;
    }
    .bc__link:hover .bc__name {
      text-decoration: underline;
    }
    .bc__art {
      display: block;
      width: 100%;
      max-width: 160px;
      aspect-ratio: 5 / 7;
      border-radius: var(--radius-md);
    }
    .bc--three .bc__art {
      max-width: 149px;
    }
    .bc__name {
      display: -webkit-box;
      overflow: hidden;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 20px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
    .bc__foot {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      max-width: 160px;
    }
    .bc__price {
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
    }
    .bc__copies {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .bc__message {
      position: absolute;
      top: 8px;
      left: 8px;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
      color: var(--color-ink);
      cursor: pointer;
      opacity: 0;
    }
    .bc__tile:hover .bc__message,
    .bc__tile:focus-within .bc__message {
      opacity: 1;
    }
    @media (hover: none) {
      .bc__message {
        opacity: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderCardsComponent {
  readonly items = input<readonly PublicInventoryItem[]>([]);
  readonly canMessage = input(false);
  /** 3 beside Search's list; otherwise as many as fit. */
  readonly columns = input<number | null>(null);
  readonly messageAbout = output<{ item: PublicInventoryItem; opener: EventTarget | null }>();
  protected readonly image = (item: PublicInventoryItem) => printingImageUrl(item.printing);
  protected readonly price = (item: PublicInventoryItem) => itemPriceText(item);
  /** "Tidecaller Mermaid, TDC-EN004, $12": two tiles of one card differ by code or price. */
  protected readonly tileLabel = (item: PublicInventoryItem) =>
    [item.card.name, printingCode(item.printing), itemPriceText(item)].filter(Boolean).join(', ');
}

/**
 * "Key cards" of a deck core (spec 8.1, board W8): the cards its owner chose, each with "×n",
 * opening its card page. The art comes from the deck core's own cards when they are listed
 * publicly; otherwise the game's placeholder art.
 */
@Component({
  selector: 'app-key-cards',
  imports: [RouterLink, CardImageComponent],
  template: `
    <ul class="kc" [class.kc--chips]="chips()" aria-label="Key cards">
      @for (card of cards(); track card.cardId) {
        <li>
          <a class="kc__card" [routerLink]="['/cards', card.cardId]">
            @if (!chips()) {
              <span class="kc__art-wrap">
                <app-card-image class="kc__art" [src]="art(card)" alt="" [game]="game()" />
                <span class="kc__badge">×{{ card.quantity }}</span>
              </span>
              <span class="kc__name">{{ card.name }}</span>
            } @else {
              {{ card.name }} ×{{ card.quantity }}
            }
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .kc {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .kc--chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .kc__card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: inherit;
      text-decoration: none;
    }
    .kc--chips .kc__card {
      min-height: 36px;
      padding: 7px 14px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .kc__art-wrap {
      position: relative;
      display: block;
      max-width: 120px;
    }
    .kc__art {
      display: block;
      width: 100%;
      aspect-ratio: 5 / 7;
      border-radius: var(--radius-md);
    }
    .kc__badge {
      position: absolute;
      right: 6px;
      bottom: 6px;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: rgba(13, 12, 11, 0.8);
      color: #fafaf9;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
    }
    .kc__name {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 20px;
    }
    .kc__card:hover .kc__name {
      text-decoration: underline;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyCardsComponent {
  readonly cards = input<readonly BinderKeyCard[]>([]);
  /** The deck core's listed cards (their art), by card id. */
  readonly items = input<readonly PublicInventoryItem[]>([]);
  readonly game = input<string | null>(null);
  /** Chips "Yubel ×3" (Search's drill-in) instead of art tiles. */
  readonly chips = input(false);
  private readonly arts = computed(() => {
    const map = new Map<string, string | null>();
    for (const item of this.items()) {
      if (!map.has(item.card.id)) {
        map.set(item.card.id, printingImageUrl(item.printing));
      }
    }
    return map;
  });
  protected art(card: BinderKeyCard): string | null {
    return this.arts().get(card.cardId) ?? null;
  }
}
