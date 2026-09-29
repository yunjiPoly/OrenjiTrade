import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CardSummary, GameMetadataField } from '@orenji/api-client';
import { gameInfo } from '../../domain/games';
import { metadataEntries } from '../catalog-labels';
import { CardImageComponent } from '../card-image/card-image.component';

/**
 * One catalog card in a results grid: picture, name (the link; the whole tile is clickable),
 * type line, game and the game's summary stats (labels from its `GameSchema`).
 */
@Component({
  selector: 'app-card-tile',
  imports: [RouterLink, CardImageComponent],
  template: `
    <article class="tile" [style.--tile-accent]="accent()">
      <app-card-image class="tile__image" [src]="card().primaryImageUrl" [game]="game()" />
      <div class="tile__body">
        <span class="tile__game">{{ gameLabel() }}</span>
        <h3 class="tile__name">
          <a class="tile__link" [routerLink]="['/cards', card().id]">{{ card().name }}</a>
        </h3>
        @if (typeLine()) {
          <p class="tile__type">{{ typeLine() }}</p>
        }
        @if (stats().length) {
          <ul class="tile__stats" aria-label="Key stats">
            @for (stat of stats(); track stat.key) {
              <li class="tile__stat">
                <span class="tile__stat-label">{{ stat.label }}</span>
                {{ stat.value }}
              </li>
            }
          </ul>
        }
        <p class="tile__count">
          {{ card().printingCount ?? 0 }}
          {{ card().printingCount === 1 ? 'printing' : 'printings' }}
        </p>
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition:
        transform var(--motion-duration-fast) var(--motion-easing-standard),
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard),
        border-color var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .tile:hover,
    .tile:focus-within {
      transform: translateY(-3px);
      border-color: color-mix(in srgb, var(--tile-accent) 45%, var(--color-border));
      box-shadow: var(--elevation-menu);
    }
    .tile__image {
      margin-bottom: var(--spacing-3);
    }
    .tile__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .tile__game {
      color: var(--tile-accent);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .tile__name {
      font-family: var(--font-body);
      font-size: var(--font-size-md);
      line-height: 1.3;
    }
    .tile__link {
      color: var(--color-ink);
      text-decoration: none;
    }
    .tile__link::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: var(--radius-lg);
    }
    .tile__link:focus-visible {
      outline: none;
    }
    .tile__link:focus-visible::after {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .tile__type {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .tile__stats {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: var(--spacing-2) 0 0;
      padding: 0;
      list-style: none;
    }
    .tile__stat {
      padding: 1px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .tile__stat-label {
      color: var(--color-text-muted);
    }
    .tile__count {
      margin: auto 0 0;
      padding-top: var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardTileComponent {
  readonly card = input.required<CardSummary>();
  /** The game's metadata fields (labels of the summary stats). */
  readonly fields = input<readonly GameMetadataField[] | null>(null);
  /** The game's `summaryFields` (stat order); defaults to the order the API sent. */
  readonly summaryFields = input<readonly string[] | null>(null);

  protected readonly game = computed(() => this.card().game ?? '');
  protected readonly gameLabel = computed(() => gameInfo(this.game()).shortLabel);
  protected readonly accent = computed(() => `var(${gameInfo(this.game()).colorVar})`);
  protected readonly typeLine = computed(() =>
    [this.card().cardType, this.card().subtype].filter(Boolean).join(' · '),
  );
  protected readonly stats = computed(() =>
    metadataEntries(this.fields(), this.card().metadata, {
      only: this.summaryFields() ?? Object.keys(this.card().metadata ?? {}),
    }).slice(0, 4),
  );
}
