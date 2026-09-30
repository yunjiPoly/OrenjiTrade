import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import type { GameResponse, SetSummary } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import { gameInfo } from '../../../shared/domain/games';
import {
  CardFilterKey,
  CardSearchParams,
  activeFilterCount,
  filterOptions,
} from './card-search-params';

export interface CardFilterChange {
  key: CardFilterKey;
  value: string | null;
}

/**
 * Filters of `/cards`: game pills, then set (for the chosen game), rarity, language and edition
 * with values from the game's schema (every game's values when no game is chosen).
 */
@Component({
  selector: 'app-card-filters',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule],
  template: `
    <div class="games" role="group" aria-label="Game">
      <button
        type="button"
        class="games__pill"
        [class.games__pill--on]="!params().game"
        [attr.aria-pressed]="!params().game"
        (click)="change('game', null)"
      >
        All games
      </button>
      @for (game of games(); track game.slug) {
        @let on = params().game === game.slug;
        <button
          type="button"
          class="games__pill"
          [class.games__pill--on]="on"
          [attr.aria-pressed]="on"
          [style.--pill-accent]="accent(game.slug)"
          (click)="change('game', on ? null : (game.slug ?? null))"
        >
          <span class="games__dot" aria-hidden="true"></span>
          {{ label(game) }}
        </button>
      }
    </div>

    <div class="filters" role="group" aria-label="Card filters">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filters__field">
        <mat-label>Set</mat-label>
        <mat-select
          [value]="params().set"
          [disabled]="!params().game"
          (selectionChange)="change('set', $event.value)"
        >
          <mat-option [value]="null">All sets</mat-option>
          @for (set of sets() ?? []; track set.id) {
            <mat-option [value]="set.code">{{ set.name }} ({{ set.code }})</mat-option>
          }
        </mat-select>
        @if (!params().game) {
          <mat-hint>Choose a game first</mat-hint>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filters__field">
        <mat-label>Rarity</mat-label>
        <mat-select [value]="params().rarity" (selectionChange)="change('rarity', $event.value)">
          <mat-option [value]="null">Any rarity</mat-option>
          @for (rarity of rarities(); track rarity) {
            <mat-option [value]="rarity">{{ rarity }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filters__field">
        <mat-label>Language</mat-label>
        <mat-select
          [value]="params().language"
          (selectionChange)="change('language', $event.value)"
        >
          <mat-option [value]="null">Any language</mat-option>
          @for (language of languages(); track language) {
            <mat-option [value]="language">{{ languageName(language) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filters__field">
        <mat-label>Edition</mat-label>
        <mat-select [value]="params().edition" (selectionChange)="change('edition', $event.value)">
          <mat-option [value]="null">Any edition</mat-option>
          @for (edition of editions(); track edition) {
            <mat-option [value]="edition">{{ editionName(edition) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (activeCount() > 0) {
        <button matButton type="button" class="filters__clear" (click)="clearAll.emit()">
          <mat-icon aria-hidden="true">filter_alt_off</mat-icon>
          Clear filters ({{ activeCount() }})
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .games {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .games__pill {
      --pill-accent: var(--color-primary);
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
      min-height: 36px;
      padding: 0 var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition:
        background var(--motion-duration-fast) var(--motion-easing-standard),
        border-color var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .games__pill:hover {
      border-color: var(--pill-accent);
    }
    .games__pill--on {
      border-color: var(--pill-accent);
      background: color-mix(in srgb, var(--pill-accent) 16%, var(--color-surface));
      font-weight: var(--font-weight-semibold);
    }
    .games__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--pill-accent);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--spacing-3);
    }
    .filters__field {
      flex: 1 1 180px;
      max-width: 260px;
    }
    .filters__clear {
      align-self: center;
    }
    @media (max-width: 599px) {
      .filters__field {
        flex-basis: calc(50% - var(--spacing-3));
        max-width: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardFiltersComponent {
  readonly params = input.required<CardSearchParams>();
  readonly games = input.required<readonly GameResponse[]>();
  /** Sets of the selected game (`null` while unknown). */
  readonly sets = input<readonly SetSummary[] | null>(null);
  readonly filterChange = output<CardFilterChange>();
  readonly clearAll = output<void>();

  protected readonly rarities = computed(() =>
    filterOptions(this.games(), this.params().game, 'rarities'),
  );
  protected readonly languages = computed(() =>
    filterOptions(this.games(), this.params().game, 'languages'),
  );
  protected readonly editions = computed(() =>
    filterOptions(this.games(), this.params().game, 'editions'),
  );
  protected readonly activeCount = computed(() => activeFilterCount(this.params()));
  protected readonly languageName = languageLabel;
  protected readonly editionName = editionLabel;

  protected change(key: CardFilterKey, value: string | null): void {
    this.filterChange.emit({ key, value });
  }

  protected label(game: GameResponse): string {
    const info = gameInfo(game.slug ?? '');
    return info.label !== game.slug ? info.shortLabel : (game.shortName ?? game.name ?? '');
  }

  protected accent(slug: string | undefined): string {
    return `var(${gameInfo(slug ?? '').colorVar})`;
  }
}
