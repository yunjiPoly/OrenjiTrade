import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicBinderSummary } from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';

/** "duelist.jp · Quebec" (a deck core's seller and province; "A collector" for a guest). */
export function coreMeta(core: PublicBinderSummary): string {
  return [core.owner?.handle || 'A collector', core.owner?.place?.subdivisionName]
    .filter(Boolean)
    .join(' · ');
}

/**
 * "Also in a deck core" (spec 7.3, board W7): a surface card with the deck core border, up to 3
 * rows of 56 (a 48 photo, "Yubel core · duelist.jp · Quebec · $95", a chevron), each opening the
 * deck core. No counts.
 */
@Component({
  selector: 'app-who-has-cores',
  imports: [RouterLink, ShellIconComponent],
  template: `
    @if (cores().length > 0) {
      <section class="wh__cores" [attr.aria-labelledby]="prefix() + '-cores-title'">
        <h3 class="wh__cores-title" [id]="prefix() + '-cores-title'">
          <span class="wh__cores-icon" aria-hidden="true"
            ><app-shell-icon name="layers" [size]="16"
          /></span>
          Also in a deck core
          <span class="wh__cores-lead">Sold together, with photos and one price</span>
        </h3>
        <ul class="wh__cores-list">
          @for (core of cores(); track core.id) {
            <li>
              <a class="wh__core" [routerLink]="['/binders', core.id]">
                <span class="wh__core-photo" aria-hidden="true">
                  @if (core.photos?.[0]?.url; as url) {
                    <img [src]="url" alt="" loading="lazy" decoding="async" />
                  }
                </span>
                <span class="wh__core-text">
                  <span class="wh__core-name">{{ core.name }}</span>
                  <span class="wh__core-meta">{{ meta(core) }}</span>
                </span>
                @if (core.askingPriceText) {
                  <span class="wh__core-price">{{ core.askingPriceText }}</span>
                }
                <app-shell-icon class="wh__muted" name="chevronRight" [size]="18" />
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .wh__muted {
      color: var(--color-text-muted);
    }
    .wh__cores {
      margin-bottom: var(--spacing-5);
      padding: var(--spacing-3) var(--spacing-3) var(--spacing-2);
      border: 1px solid var(--color-deck-core-border);
      border-radius: var(--radius-lg);
      background: var(--color-deck-core-surface);
    }

    .wh__cores-title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-2);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
    }

    .wh__cores-icon {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--color-deck-core-tag-background);
      color: var(--color-deck-core-tag-text);
    }

    .wh__cores-lead {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-regular);
    }

    .wh__cores-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .wh__core {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      min-height: 56px;
      padding: 4px var(--spacing-1);
      border-radius: var(--radius-md);
      color: inherit;
      text-decoration: none;
    }

    .wh__core:hover {
      background: var(--color-primary-tint-subtle);
    }

    .wh__core-photo {
      flex: none;
      width: 48px;
      height: 48px;
      overflow: hidden;
      border-radius: var(--radius-md);
      background: var(--color-photo-backdrop);
    }

    .wh__core-photo img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .wh__core-text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }

    .wh__core-name {
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
    }

    .wh__core-meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }

    .wh__core-price {
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhoHasCoresComponent {
  readonly cores = input<readonly PublicBinderSummary[]>([]);
  readonly prefix = input('wh');
  protected readonly meta = coreMeta;
}
