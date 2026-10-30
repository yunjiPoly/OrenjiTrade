import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FeedCardPreview, FeedPost } from '@orenji/api-client';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { MediaUrlPipe } from '../../shared/pipes/media-url.pipe';
import { IHaveIt, iHaveItLabel } from '../../shared/wishlist/i-have-it.service';
import { wishTerms } from '../../shared/wishlist/wishlist-labels';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';
import { CardImageComponent } from '../../shared/ui/card-image/card-image.component';
import {
  cardTiles,
  feedTime,
  postPlace,
  postVerb,
  posterName,
} from './home-rules';
import { itemPriceText } from '../inventory/data/item-price';

/**
 * One post of Home's feed (spec 5.2, board W1): the header (a 36 avatar, "maya_k listed 12
 * cards", "5 min · Quebec"; the avatar and handle open the profile) and the body of its kind: six
 * tiles of new cards (the 6th "+N" from 7 cards, opening the profile), one card with "Message",
 * a wish with "I have it", or a deck core's photo band opening the deck core. A guest reads "A
 * collector" with a plain avatar and no link (R15); Message and "I have it" ask to sign in.
 */
@Component({
  selector: 'app-feed-post',
  imports: [RouterLink, AvatarComponent, CardImageComponent, MediaUrlPipe, ShellIconComponent],
  template: `
    @let p = post();
    @let handle = p.collector.handle;
    @let verb = verbOf();
    <article class="fp" [attr.aria-labelledby]="headId()" data-testid="feed-post">
      <header class="fp__head">
        @if (handle) {
          <a class="fp__avatar" [routerLink]="['/collectors', handle]" tabindex="-1" aria-hidden="true">
            <app-avatar [src]="p.collector.avatarUrl" [name]="p.collector.displayName || handle" [decorative]="true" />
          </a>
        } @else {
          <span class="fp__avatar fp__avatar--guest" aria-hidden="true">
            <app-shell-icon name="profile" [size]="18" />
          </span>
        }
        <div class="fp__who">
          <p class="fp__title" [id]="headId()">
            @if (handle) {
              <a class="fp__handle" [routerLink]="['/collectors', handle]">{{ handle }}</a>
            } @else {
              <span class="fp__handle">{{ name() }}</span>
            }
            <span class="fp__verb" [attr.data-tone]="verb.tone"> {{ verb.text }}</span>
          </p>
          <p class="fp__meta">{{ time() }} · {{ place() }}</p>
        </div>
      </header>

      @switch (p.kind) {
        @case ('NEW_CARDS') {
          @if (single(); as card) {
            <div class="fp__one">
              <a class="fp__one-art" [routerLink]="['/cards', card.cardId]" [queryParams]="{ printing: card.printingId }" tabindex="-1" aria-hidden="true">
                <app-card-image [src]="card.imageUrl" [game]="game()" size="xs" alt="" />
              </a>
              <div class="fp__one-text">
                <a class="fp__name" [routerLink]="['/cards', card.cardId]" [queryParams]="{ printing: card.printingId }">{{ card.name }}</a>
                @if (card.printingCode || card.rarity) {
                  <p class="fp__line">
                    @if (card.printingCode) {
                      <span class="mono">{{ card.printingCode }}</span>
                    }
                    @if (card.printingCode && card.rarity) {
                      <span> · </span>
                    }
                    @if (card.rarity) {
                      <span>{{ card.rarity }}</span>
                    }
                  </p>
                }
                @if (price(card); as pr) {
                  <p class="fp__price">{{ pr }}</p>
                }
              </div>
              <button
                type="button"
                class="fp__message"
                data-testid="feed-message"
                [attr.aria-label]="messageLabel(card)"
                [disabled]="drawer.starting() === p.collector.id && !!p.collector.id"
                (click)="message(card, $event.currentTarget)"
              >
                <app-shell-icon name="messages" [size]="18" />
                Message
              </button>
            </div>
          } @else {
            <ul class="fp__tiles" role="list">
              @for (tile of tiles(); track $index) {
                <li class="fp__tile">
                  @if (tile.kind === 'card') {
                    <a
                      class="fp__tile-link"
                      [routerLink]="['/cards', tile.card.cardId]"
                      [queryParams]="{ printing: tile.card.printingId }"
                      [attr.aria-label]="tile.price ? tile.card.name + ', ' + tile.price : tile.card.name"
                    >
                      <app-card-image class="fp__tile-art" [src]="tile.card.imageUrl" [game]="game()" alt="" />
                      <span class="fp__tile-price" aria-hidden="true">{{ tile.price || ' ' }}</span>
                    </a>
                  } @else if (handle) {
                    <a class="fp__tile-link" [routerLink]="['/collectors', handle]" [attr.aria-label]="moreLabel(tile.count)">
                      <span class="fp__more" aria-hidden="true">+{{ tile.count }}</span>
                      <span class="fp__tile-price" aria-hidden="true">more</span>
                    </a>
                  } @else {
                    <span class="fp__tile-link" [attr.aria-label]="moreLabel(tile.count)" role="img">
                      <span class="fp__more" aria-hidden="true">+{{ tile.count }}</span>
                      <span class="fp__tile-price" aria-hidden="true">more</span>
                    </span>
                  }
                </li>
              }
            </ul>
          }
        }
        @case ('WANTED') {
          @if (p.wanted; as wish) {
            <div class="fp__one">
              <a class="fp__one-art" [routerLink]="['/cards', wish.cardId]" tabindex="-1" aria-hidden="true">
                <app-card-image [src]="wish.imageUrl" [game]="game()" size="xs" alt="" />
              </a>
              <div class="fp__one-text">
                <a class="fp__name" [routerLink]="['/cards', wish.cardId]">{{ wish.name }}</a>
                <p class="fp__line">{{ terms() }}</p>
              </div>
              <button
                type="button"
                class="fp__have"
                data-testid="feed-have-it"
                [attr.aria-label]="haveLabel()"
                (click)="haveIt($event.currentTarget)"
              >
                I have it
              </button>
            </div>
          }
        }
        @case ('DECK_CORE') {
          @if (p.deckCore; as core) {
            <a class="fp__core" [routerLink]="['/binders', core.binderId]" data-testid="feed-deck-core">
              <span class="fp__band" aria-hidden="true">
                @if (core.photoUrl) {
                  <img class="fp__photo" [src]="core.photoUrl | mediaUrl" alt="" loading="lazy" decoding="async" />
                } @else {
                  <span class="fp__fan">
                    @for (image of core.previewImages.slice(0, 3); track $index) {
                      <app-card-image class="fp__fan-card" [src]="image" [game]="game()" size="sm" alt="" />
                    }
                  </span>
                }
                <span class="fp__tag"><app-shell-icon name="layers" [size]="12" /> Deck core</span>
                @if (core.photoCount > 0) {
                  <span class="fp__photos"><app-shell-icon name="camera" [size]="12" /> {{ core.photoCount }} {{ core.photoCount === 1 ? 'photo' : 'photos' }}</span>
                }
              </span>
              <span class="fp__core-row">
                <span class="fp__core-name">{{ core.name }}</span>
                @if (core.askingPriceText) {
                  <span class="fp__core-price">{{ core.askingPriceText }}</span>
                }
              </span>
              @if (core.noteFirstLine) {
                <span class="fp__note">{{ core.noteFirstLine }}</span>
              }
            </a>
          }
        }
      }
    </article>
  `,
  styleUrl: './feed-post.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedPostComponent {
  readonly post = input.required<FeedPost>();
  /** The browsed game (the card pictures' placeholder). */
  readonly game = input('');
  /** "now" for the times (the page ticks it). */
  readonly now = input<Date>(new Date());

  protected readonly drawer = inject(ChatDrawer);
  private readonly iHaveIt = inject(IHaveIt);

  protected readonly headId = computed(() => `post-${this.post().id}`);
  protected readonly verbOf = computed(() => postVerb(this.post()));
  protected readonly name = computed(() => posterName(this.post()));
  protected readonly place = computed(() => postPlace(this.post()));
  protected readonly time = computed(() => feedTime(this.post().at, this.now()));
  protected readonly single = computed(() => {
    const cards = this.post().newCards;
    return cards && cards.total === 1 && cards.previews.length === 1 ? cards.previews[0] : null;
  });
  protected readonly tiles = computed(() => {
    const cards = this.post().newCards;
    return cards ? cardTiles(cards.previews, cards.total) : [];
  });
  protected readonly terms = computed(() => {
    const wish = this.post().wanted;
    return wish ? wishTerms(wish) : '';
  });
  protected readonly haveLabel = computed(() =>
    iHaveItLabel(this.post().wanted?.name ?? 'this card', this.post().collector.handle),
  );

  protected price(card: FeedCardPreview): string | null {
    return itemPriceText(card);
  }

  protected messageLabel(card: FeedCardPreview): string {
    return `Message ${this.name()} about ${card.name}`;
  }

  protected moreLabel(count: number): string {
    return `${count} more ${count === 1 ? 'card' : 'cards'} from ${this.name()}`;
  }

  /** "Message": the chat drawer with this card as the chat's subject (spec 5.2). */
  protected message(card: FeedCardPreview, opener: EventTarget | null): void {
    const recipientId = this.post().collector.id;
    void this.drawer.message({ recipientId: recipientId ?? '', subjectItemId: card.itemId }, opener);
  }

  /** "I have it": the chat drawer to the wisher with "Hi! I have {card}." (spec 5.2). */
  protected haveIt(opener: EventTarget | null): void {
    const post = this.post();
    const wish = post.wanted;
    if (!wish) {
      return;
    }
    void this.iHaveIt.offer(
      post.collector.id ?? '',
      {
        cardId: wish.cardId,
        name: wish.name,
        printingId: wish.printing?.id ?? null,
        rarity: wish.rarity ?? null,
      },
      opener,
    );
  }
}
