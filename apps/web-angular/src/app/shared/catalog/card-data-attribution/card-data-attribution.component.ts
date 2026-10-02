import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  CARD_DATA_ATTRIBUTIONS,
  CardDataAttribution,
  attributionFor,
} from './card-data-attributions';

/**
 * Credits for card data and pictures from external catalog providers. With `game`, only that
 * game's provider (nothing when the game has none); without it, every provider (the footer).
 */
@Component({
  selector: 'app-card-data-attribution',
  template: `
    @for (entry of entries(); track entry.game) {
      <p class="attribution" [attr.data-game]="entry.game" data-testid="card-data-attribution">
        {{ entry.credit }}
        <a [href]="entry.providerUrl" target="_blank" rel="noopener noreferrer">{{
          entry.provider
        }}</a
        >. {{ entry.notice }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .attribution {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      line-height: 1.45;
    }
    .attribution + .attribution {
      margin-top: var(--spacing-1);
    }
    a {
      color: inherit;
      text-decoration: underline;
    }
    a:hover {
      color: var(--color-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDataAttributionComponent {
  /** Game slug; `undefined` lists every provider. */
  readonly game = input<string | null | undefined>(undefined);

  protected readonly entries = computed<readonly CardDataAttribution[]>(() => {
    const game = this.game();
    if (game === undefined) {
      return CARD_DATA_ATTRIBUTIONS;
    }
    const entry = attributionFor(game);
    return entry ? [entry] : [];
  });
}
