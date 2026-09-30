import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import type { CardSummary } from '@orenji/api-client';
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component';
import { CardTileComponent } from '../card-tile/card-tile.component';
import { GamesStore } from '../games.store';

/**
 * Responsive grid of card tiles (2 columns on phones up to 6 on wide screens). With `loading`
 * and no cards it shows skeleton tiles; with cards it dims them while a new page loads.
 */
@Component({
  selector: 'app-card-grid',
  imports: [CardTileComponent, SkeletonComponent],
  template: `
    @if (cards().length === 0 && loading()) {
      <div class="grid" aria-busy="true">
        <span class="visually-hidden">Loading cards</span>
        @for (slot of skeletons(); track slot) {
          <app-skeleton variant="card" />
        }
      </div>
    } @else {
      <ul class="grid" [class.grid--dim]="loading()" [attr.aria-label]="label()">
        @for (card of cards(); track card.id) {
          <li class="grid__item">
            <app-card-tile
              [card]="card"
              [fields]="schemaOf(card.game)?.metadataFields ?? null"
              [summaryFields]="schemaOf(card.game)?.summaryFields ?? null"
            />
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      gap: var(--spacing-4);
      margin: 0;
      padding: 0;
      list-style: none;
      transition: opacity var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .grid--dim {
      opacity: 0.6;
    }
    .grid__item {
      min-width: 0;
    }
    @media (max-width: 599px) {
      .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-3);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardGridComponent {
  private readonly games = inject(GamesStore);

  readonly cards = input.required<readonly CardSummary[]>();
  readonly loading = input(false, { transform: booleanAttribute });
  readonly label = input('Cards');
  readonly skeletonCount = input(12, { transform: numberAttribute });

  protected readonly skeletons = computed(() =>
    Array.from({ length: this.skeletonCount() }, (_, index) => index),
  );

  constructor() {
    void this.games.load();
  }

  protected schemaOf(slug: string | undefined) {
    return this.games.schema(slug);
  }
}
