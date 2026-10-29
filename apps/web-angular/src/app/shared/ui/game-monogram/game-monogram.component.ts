import { ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core';
import { gameInfo } from '../../domain/games';

/**
 * A game's monogram tile (design tokens `gameTile`, web redesign spec 9.2 and 9.4): the letter on
 * the game's colours, 16 to 24 px. Decorative: the game's name is said by the text beside it,
 * unless `label` names it.
 */
@Component({
  selector: 'app-game-monogram',
  template: `{{ info().letter }}`,
  host: {
    class: 'mono-tile',
    '[style.--mono-size.px]': 'size()',
    '[style.--mono-bg]': "'var(--game-tile-' + info().tileKey + '-background, var(--color-surface-variant))'",
    '[style.--mono-fg]': "'var(--game-tile-' + info().tileKey + '-foreground, var(--color-ink))'",
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() ? info().label : null',
  },
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: var(--mono-size);
      height: var(--mono-size);
      border-radius: calc(var(--mono-size) / 4);
      background: var(--mono-bg);
      color: var(--mono-fg);
      font-family: var(--font-display);
      font-size: calc(var(--mono-size) * 0.55);
      font-weight: var(--font-weight-bold);
      line-height: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameMonogramComponent {
  readonly game = input.required<string>();
  readonly size = input(16, { transform: numberAttribute });
  /** Say the game's name (when no text beside it does). */
  readonly label = input(false);
  protected readonly info = computed(() => gameInfo(this.game()));
}
