import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { GamesStore } from '../../catalog/games.store';
import { GAMES, GameInfo, gameInfo } from '../../domain/games';
import { CardArtComponent } from '../../ui/card-art/card-art.component';

/**
 * Selectable game tiles with card art (toggle buttons, keyboard accessible). The list comes from
 * `GET /games` (hidden games disappear); the built-in list stands in while it loads or when the
 * API cannot be reached.
 */
@Component({
  selector: 'app-game-picker',
  imports: [MatIconModule, CardArtComponent],
  template: `
    <div class="games" role="group" [attr.aria-label]="label()">
      @for (game of games(); track game.slug) {
        @let selected = value().includes(game.slug);
        <button
          type="button"
          class="game"
          [class.game--selected]="selected"
          [attr.aria-pressed]="selected"
          [disabled]="disabled()"
          (click)="toggle(game.slug)"
        >
          <app-card-art class="game__art" [game]="game.slug" />
          <span class="game__label">{{ game.label }}</span>
          <mat-icon class="game__check" aria-hidden="true">
            {{ selected ? 'check_circle' : 'add_circle' }}
          </mat-icon>
        </button>
      }
    </div>
  `,
  styles: `
    .games {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--spacing-3);
    }
    .game {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-4) var(--spacing-2) var(--spacing-3);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      cursor: pointer;
      transition:
        border-color var(--motion-duration-fast) var(--motion-easing-standard),
        transform var(--motion-duration-fast) var(--motion-easing-standard),
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard);
      --card-width: 64px;
    }
    .game:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: var(--elevation-menu);
    }
    .game--selected {
      border-color: var(--color-primary);
      background: var(--color-primary-container);
    }
    .game__label {
      font-weight: var(--font-weight-semibold);
      font-size: var(--font-size-sm);
      text-align: center;
    }
    .game__check {
      position: absolute;
      top: var(--spacing-2);
      right: var(--spacing-2);
      color: var(--color-text-muted);
    }
    .game--selected .game__check {
      color: var(--color-primary);
    }
    @media (max-width: 719px) {
      .games {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePickerComponent {
  readonly value = model<string[]>([]);
  readonly label = input('Games you collect or play');
  readonly disabled = input(false, { transform: booleanAttribute });
  private readonly store = inject(GamesStore);
  protected readonly games = computed<readonly GameInfo[]>(() => {
    const games = this.store.games();
    if (!games) {
      return GAMES;
    }
    return games
      .filter((game) => !!game.slug)
      .map((game) => {
        const known = gameInfo(game.slug ?? '');
        return known.label !== game.slug
          ? known
          : {
              ...known,
              label: game.shortName || game.name || known.label,
              shortLabel: game.shortName || known.shortLabel,
            };
      });
  });

  constructor() {
    void this.store.load();
  }

  protected toggle(slug: string): void {
    this.value.update((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }
}
