import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { WishlistSummaryEntry } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { conditionLabel, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { wishPrintingLabel } from '../../../shared/wishlist/wishlist-labels';

/**
 * "Looking for": a collector's public wishlist (`GET /collectors/{handle}/wishlist`, only when
 * they show it): card, printing or any printing, minimum condition. Never prices, radii or notes.
 */
@Component({
  selector: 'app-collector-wishlist',
  imports: [MatIconModule, RouterLink, CardImageComponent],
  template: `
    <ul class="cw" [attr.aria-label]="label()">
      @for (wish of entries(); track $index) {
        <li class="cw__item">
          <app-card-image class="cw__img" [src]="imageOf(wish)" [alt]="wish.card?.name ?? ''" />
          <div class="cw__text">
            @if (wish.card; as card) {
              <a
                class="cw__name"
                [routerLink]="['/cards', card.id]"
                [queryParams]="queryOf(wish)"
                >{{ card.name }}</a
              >
            }
            <span class="cw__meta">{{ printingOf(wish) }}</span>
            @if (wish.conditionMin) {
              <span class="cw__meta">
                <mat-icon aria-hidden="true">verified</mat-icon>
                {{ condition(wish.conditionMin) }} or better
              </span>
            }
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .cw {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cw__item {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .cw__img {
      flex: 0 0 48px;
      width: 48px;
      --card-image-shadow: none;
    }
    .cw__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .cw__name {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .cw__name:hover {
      color: var(--color-primary);
    }
    .cw__meta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .cw__meta mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorWishlistComponent {
  readonly entries = input.required<readonly WishlistSummaryEntry[]>();
  readonly label = input('Cards this collector is looking for');

  protected readonly condition = conditionLabel;
  protected readonly printingOf = (wish: WishlistSummaryEntry) => wishPrintingLabel(wish.printing);

  protected queryOf(wish: WishlistSummaryEntry): Record<string, string> {
    return wish.printing?.id ? { printing: wish.printing.id } : {};
  }

  protected imageOf(wish: WishlistSummaryEntry): string | null {
    return printingImageUrl(wish.printing) ?? wish.card?.imageUrl ?? null;
  }
}
