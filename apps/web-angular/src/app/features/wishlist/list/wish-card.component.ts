import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { WishlistItemResponse } from '@orenji/api-client';
import { printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { whichCopyLabel, wishCardQuery, wishChips } from '../../../shared/wishlist/wishlist-labels';

/**
 * One wish (stage S2): card picture, name (links to the card page with the wish's selection),
 * which copy ("Any printing", "Any printing · <rarity>" or the printing), the public note, the
 * "Near Mint only" and price term chips (with the approximate amount for one printing), and the
 * edit and remove buttons.
 */
@Component({
  selector: 'app-wish-card',
  imports: [RouterLink, MatButtonModule, MatIconModule, CardImageComponent, GameChipComponent],
  template: `
    @let wish = item();
    <article class="wc" [attr.aria-labelledby]="titleId()" [attr.data-wish]="wish.id">
      <div class="wc__media">
        <app-card-image [src]="image()" [alt]="name()" [game]="wish.game" />
      </div>
      <div class="wc__body">
        <div class="wc__titles">
          <app-game-chip [slug]="wish.game" />
          <h3 class="wc__name" [id]="titleId()">
            @if (wish.card; as card) {
              <a class="wc__link" [routerLink]="['/cards', card.id]" [queryParams]="cardQuery()">{{
                card.name
              }}</a>
            } @else {
              {{ name() }}
            }
          </h3>
          <p class="wc__copy" data-testid="wish-copy">{{ copy() }}</p>
        </div>

        @if (wish.note) {
          <p class="wc__note" data-testid="wish-note-text">
            <span class="visually-hidden">Public note:</span>
            “{{ wish.note }}”
          </p>
        }

        @if (chips().length) {
          <ul class="wc__chips" [attr.aria-label]="'What you want for ' + name()">
            @for (chip of chips(); track chip.kind) {
              <li class="wc__chip" [attr.data-kind]="chip.kind">
                <mat-icon aria-hidden="true">{{ chip.icon }}</mat-icon>
                {{ chip.label }}
              </li>
            }
          </ul>
        }

        <div class="wc__foot">
          <button
            matButton
            type="button"
            [disabled]="busy()"
            [attr.aria-label]="'Edit the wish for ' + name()"
            (click)="edit.emit()"
          >
            <mat-icon aria-hidden="true">edit</mat-icon>
            Edit
          </button>
          <button
            matButton
            type="button"
            class="wc__danger"
            [disabled]="busy()"
            [attr.aria-label]="'Remove ' + name() + ' from your wishlist'"
            (click)="remove.emit()"
          >
            <mat-icon aria-hidden="true">delete</mat-icon>
            Remove
          </button>
        </div>
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .wc {
      display: flex;
      gap: var(--spacing-4);
      height: 100%;
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .wc:focus-within {
      box-shadow: var(--elevation-menu);
    }
    .wc__media {
      flex: 0 0 92px;
      width: 92px;
    }
    .wc__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--spacing-2);
      min-width: 0;
    }
    .wc__titles {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }
    .wc__name {
      font-family: var(--font-body);
      font-size: var(--font-size-lg);
      line-height: 1.25;
    }
    .wc__link {
      color: var(--color-ink);
      text-decoration: none;
    }
    .wc__link:hover {
      color: var(--color-primary);
    }
    .wc__copy {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .wc__note {
      margin: 0;
      font-size: var(--font-size-sm);
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    .wc__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .wc__chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .wc__chip mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
      color: var(--color-text-muted);
    }
    .wc__chip[data-kind='price-term'] {
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .wc__chip[data-kind='price-term'] mat-icon {
      color: inherit;
    }
    .wc__foot {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1);
      margin-top: auto;
      margin-left: -12px;
      padding-top: var(--spacing-1);
    }
    .wc__danger {
      color: var(--color-danger);
    }
    @media (max-width: 599px) {
      .wc {
        padding: var(--spacing-3);
        gap: var(--spacing-3);
      }
      .wc__media {
        flex-basis: 72px;
        width: 72px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishCardComponent {
  readonly item = input.required<WishlistItemResponse>();
  /** An update or removal of this wish is running. */
  readonly busy = input(false);

  readonly edit = output<void>();
  readonly remove = output<void>();

  protected readonly titleId = computed(() => `wish-${this.item().id}`);
  protected readonly name = computed(() => this.item().card?.name ?? 'Unknown card');
  protected readonly image = computed(
    () => printingImageUrl(this.item().printing) ?? this.item().card?.imageUrl ?? null,
  );
  protected readonly copy = computed(() =>
    whichCopyLabel(this.item().printing, this.item().rarity),
  );
  protected readonly cardQuery = computed(() => wishCardQuery(this.item()));
  protected readonly chips = computed(() => wishChips(this.item()));
}
