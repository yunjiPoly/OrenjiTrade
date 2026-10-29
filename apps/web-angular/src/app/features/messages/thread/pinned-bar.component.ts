import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { ConversationSubject } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { PINNED_COPY } from '../data/chat-copy';
import { DealSide, pinnedEnd, pinnedLine, subjectPrice } from '../data/deal-rules';

/**
 * The pinned subject bar (60, spec 10.3, boards W18 and W20): the card or deck core the chat is
 * about, 30×42 art, the name, "{code} · {rarity}" in mono ("· your card" for the seller) and the
 * price; the seller's teal outline [Mark as sold] (32), the only entry of Mark as sold; a "Sold"
 * tag after the sale; "No longer listed" for a buyer once it is off offer (no price then). The
 * art and the name open the card or the deck core.
 */
@Component({
  selector: 'app-pinned-bar',
  imports: [RouterLink, MatIconModule, CardImageComponent],
  template: `
    @let s = subject();
    <div class="pin" data-testid="pinned-bar">
      <!-- Its name is the visible name and line (WCAG 2.5.3); the art is decorative. -->
      <a class="pin__open" [routerLink]="link()" [queryParams]="query()">
        @if (s.kind === 'DECK_CORE' && !s.imageUrl) {
          <span class="pin__core" aria-hidden="true"><mat-icon>style</mat-icon></span>
        } @else {
          <app-card-image class="pin__art" size="fill" [src]="s.imageUrl" alt="" />
        }
        <span class="pin__names">
          <span class="pin__name">
            {{ s.name }}
            @if (s.kind === 'DECK_CORE') {
              <span class="pin__tag">{{ copy.deckCore }}</span>
            }
          </span>
          @if (line()) {
            <span class="pin__line mono">{{ line() }}</span>
          }
        </span>
      </a>
      <span class="pin__end">
        @if (price() && end() !== 'unlisted') {
          <span class="pin__price" data-testid="pinned-price">{{ price() }}</span>
        }
        @switch (end()) {
          @case ('markAsSold') {
            <button
              type="button"
              class="pin__sell"
              data-testid="mark-as-sold"
              [attr.aria-label]="copy.markAsSoldLabel(s.name)"
              [disabled]="disabled()"
              (click)="markSold.emit()"
            >
              {{ copy.markAsSold }}
            </button>
          }
          @case ('sold') {
            <span class="pin__sold" data-testid="sold-tag">{{ copy.sold }}</span>
          }
          @case ('unlisted') {
            <span class="pin__unlisted">{{ copy.noLongerListed }}</span>
          }
        }
      </span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .pin {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      min-height: 60px;
      /* The content centred at max 720 with the thread (spec 10.1, WC review U12). */
      padding: 8px max(var(--spacing-5), calc((100% - 720px) / 2));
      border-bottom: 1px solid var(--color-border);
      background: var(--color-chat-pinned-bar);
    }
    .pin__open {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: var(--spacing-3);
      min-width: 0;
      border-radius: var(--radius-sm);
      color: inherit;
      text-decoration: none;
    }
    .pin__open:hover .pin__name {
      text-decoration: underline;
    }
    .pin__open:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .pin__art {
      flex: 0 0 30px;
      width: 30px;
    }
    .pin__core {
      display: grid;
      flex: 0 0 30px;
      place-items: center;
      width: 30px;
      height: 42px;
      border-radius: 4px;
      background: var(--color-deck-core-tag-background);
      color: var(--color-deck-core-tag-text);
    }
    .pin__core mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .pin__names {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .pin__name {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      overflow: hidden;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pin__tag {
      flex: 0 0 auto;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--color-deck-core-tag-background);
      color: var(--color-deck-core-tag-text);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
    }
    .pin__line {
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pin__end {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: var(--spacing-3);
    }
    .pin__price {
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
    }
    .pin__sell {
      height: 32px;
      padding: 0 14px;
      border: 1.5px solid var(--color-chat-sale-action);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-chat-sale-action);
      font: inherit;
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-bold);
      cursor: pointer;
    }
    .pin__sell:hover:not(:disabled) {
      background: var(--color-accent-tint);
    }
    .pin__sell:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .pin__sell:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .pin__sold {
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      background: var(--color-chat-sold-tag-background);
      color: var(--color-chat-sold-tag-text);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
    }
    .pin__unlisted {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    @media (max-width: 599.98px) {
      .pin {
        padding: 8px var(--spacing-3);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PinnedBarComponent {
  readonly subject = input.required<ConversationSubject>();
  readonly side = input.required<DealSide>();
  /** The other collector's handle (a buyer reads "{seller}'s deck core"). */
  readonly otherHandle = input('');
  /** The chat cannot receive messages (Mark as sold waits). */
  readonly disabled = input(false);
  readonly markSold = output<void>();

  protected readonly copy = PINNED_COPY;
  protected readonly line = computed(() =>
    pinnedLine(this.subject(), this.side(), this.otherHandle()),
  );
  protected readonly end = computed(() => pinnedEnd(this.subject(), this.side()));
  protected readonly price = computed(() => subjectPrice(this.subject()));
  protected readonly link = computed(() => {
    const s = this.subject();
    if (s.kind === 'DECK_CORE') {
      return ['/binders', s.id];
    }
    return s.cardId ? ['/cards', s.cardId] : null;
  });
  protected readonly query = computed(() => {
    const s = this.subject();
    return s.kind === 'CARD' && s.printingId ? { printing: s.printingId } : null;
  });
}
