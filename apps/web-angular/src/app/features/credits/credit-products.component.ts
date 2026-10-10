import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { CreditProduct } from '@orenji/api-client';
import { creditsLabel, durationLabel } from '../../shared/billing/billing-labels';

const PRODUCT_ICONS: Record<string, string> = {
  'filters.advanced': 'tune',
  'binder.views.per_day': 'menu_book',
};

/** What credits unlock (`GET /me/credits` → `products`), each with its cost and duration. */
@Component({
  selector: 'app-credit-products',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (products().length) {
      <ul class="products" aria-label="Features you can unlock">
        @for (product of products(); track product.key) {
          <li class="product" [attr.data-product]="product.key">
            <span class="product__icon" aria-hidden="true">
              <mat-icon>{{ icon(product.featureKey) }}</mat-icon>
            </span>
            <h3 class="product__name">{{ product.name }}</h3>
            @if (product.description) {
              <p class="product__description">{{ product.description }}</p>
            }
            <p class="product__meta">
              <span class="product__cost">{{ credits(product.cost) }}</span>
              <span class="product__duration">
                <mat-icon aria-hidden="true">schedule</mat-icon>
                {{ duration(product.durationHours) }}
              </span>
            </p>
            <button
              matButton="filled"
              type="button"
              class="product__cta"
              [disabled]="(product.cost ?? 0) > balance()"
              [attr.aria-describedby]="
                (product.cost ?? 0) > balance() ? 'product-short-' + product.key : null
              "
              (click)="unlock.emit(product)"
            >
              Unlock for {{ credits(product.cost) }}
            </button>
            @if ((product.cost ?? 0) > balance()) {
              <p class="product__short" [id]="'product-short-' + product.key">
                You need {{ credits((product.cost ?? 0) - balance()) }} more.
              </p>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="products__none">Nothing can be unlocked with credits right now.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .products {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: var(--spacing-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .product {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition:
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard),
        transform var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .product:hover {
      box-shadow: var(--elevation-menu);
      transform: translateY(-1px);
    }
    .product__icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .product__name {
      margin: 0;
      font-size: var(--font-size-md);
    }
    .product__description {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .product__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin: auto 0 0;
      padding-top: var(--spacing-2);
    }
    .product__cost {
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .product__duration {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .product__duration mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .product__cta {
      width: 100%;
    }
    .product__short,
    .products__none {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .products__none {
      font-size: var(--font-size-sm);
    }
    @media (prefers-reduced-motion: reduce) {
      .product,
      .product:hover {
        transition: none;
        transform: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditProductsComponent {
  readonly products = input.required<readonly CreditProduct[]>();
  readonly balance = input.required<number>();

  readonly unlock = output<CreditProduct>();

  protected readonly credits = creditsLabel;
  protected readonly duration = durationLabel;

  protected icon(featureKey: string | undefined): string {
    return PRODUCT_ICONS[featureKey ?? ''] ?? 'bolt';
  }
}
