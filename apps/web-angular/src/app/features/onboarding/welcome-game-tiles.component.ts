import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import { GameMonogramComponent } from '../../shared/ui/game-monogram/game-monogram.component';
import { WELCOME_COPY } from './welcome-copy';
import { WelcomeGame, openingGame } from './welcome-rules';

/**
 * "What do you collect?" (spec 14): the five games as 96 tiles (toggle buttons), "Opens first" on
 * the first picked game Home and Search can browse, games whose cards are coming soon dimmed
 * (they can be picked, not browsed yet).
 */
@Component({
  selector: 'app-welcome-game-tiles',
  imports: [GameMonogramComponent, ShellIconComponent],
  template: `
    <div class="tiles" role="group" [attr.aria-label]="copy.gamesLabel">
      @for (game of games(); track game.slug) {
        @let on = value().includes(game.slug);
        <button
          type="button"
          class="tile"
          [class.tile--on]="on"
          [class.tile--soon]="!game.browsable"
          [attr.aria-pressed]="on"
          [attr.aria-describedby]="
            opening() === game.slug ? 'tile-first' : !game.browsable ? 'tile-soon' : null
          "
          [attr.data-game]="game.slug"
          (click)="toggle(game.slug)"
        >
          @if (on) {
            <span class="tile__check" aria-hidden="true">
              <app-shell-icon name="check" [size]="12" [stroke]="3.2" />
            </span>
          }
          <app-game-monogram [game]="game.slug" [size]="36" />
          <span class="tile__name">{{ game.name }}</span>
          @if (opening() === game.slug) {
            <span class="tile__badge" aria-hidden="true">{{ copy.opensFirst }}</span>
          } @else if (!game.browsable) {
            <span class="tile__soon" aria-hidden="true">{{ copy.comingSoon }}</span>
          }
        </button>
      }
    </div>
    <span class="visually-hidden" id="tile-first">{{ copy.opensFirst }}</span>
    <span class="visually-hidden" id="tile-soon">{{ copy.comingSoon }}</span>
  `,
  styles: `
    :host {
      display: block;
    }
    .tiles {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-sizing: border-box;
      width: 96px;
      height: 96px;
      padding: 8px 4px;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      cursor: pointer;
    }
    .tile:hover {
      border-color: var(--color-border-strong);
    }
    .tile--on {
      border: 2px solid var(--color-primary);
      background: var(--color-primary-tint-subtle);
    }
    /* Dimmed: the art and the name; "Cards coming soon" stays readable at full strength (4.5:1
       or more on the tile, WG review A3). */
    .tile--soon:not(.tile--on) app-game-monogram,
    .tile--soon:not(.tile--on) .tile__name {
      opacity: 0.6;
    }
    .tile:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .tile__name {
      max-width: 100%;
      overflow: hidden;
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
      line-height: 16px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile__check {
      position: absolute;
      top: 6px;
      right: 6px;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .tile__badge,
    .tile__soon {
      position: absolute;
      bottom: -9px;
      left: 50%;
      padding: 1px 6px;
      border-radius: var(--radius-pill);
      font-size: 10px;
      font-weight: var(--font-weight-semibold);
      line-height: 14px;
      white-space: nowrap;
      transform: translateX(-50%);
    }
    .tile__badge {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .tile__soon {
      position: static;
      padding: 0;
      color: var(--color-text-muted);
      font-weight: var(--font-weight-medium);
      transform: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeGameTilesComponent {
  readonly games = input.required<readonly WelcomeGame[]>();
  /** The picked slugs, in the order they were picked (the first browsable one opens first). */
  readonly value = model<string[]>([]);

  protected readonly copy = WELCOME_COPY.games;
  protected readonly opening = computed(() => openingGame(this.value(), this.games()));

  protected toggle(slug: string): void {
    const current = this.value();
    this.value.set(
      current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug],
    );
  }
}
