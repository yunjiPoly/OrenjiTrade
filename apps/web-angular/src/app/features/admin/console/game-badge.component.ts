import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const LETTERS: Readonly<Record<string, string>> = {
  yugioh: 'Y',
  pokemon: 'P',
  mtg: 'M',
  onepiece: 'O',
  riftbound: 'R',
};

/** A game's letter tile (the phone's game tile colours, tokens `--game-tile-*`); decorative. */
@Component({
  selector: 'app-game-badge',
  template: `{{ letter() }}`,
  host: {
    'aria-hidden': 'true',
    '[class.gb--small]': "size() === 'sm'",
    '[style.background]': 'background()',
    '[style.color]': 'foreground()',
  },
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      font-family: var(--font-display);
      font-size: 14px;
      font-weight: var(--font-weight-bold);
    }
    :host(.gb--small) {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      font-size: 11px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBadgeComponent {
  readonly game = input.required<string>();
  readonly size = input<'sm' | 'md'>('md');
  protected readonly letter = computed(
    () => LETTERS[this.game()] ?? this.game().charAt(0).toUpperCase(),
  );
  protected readonly background = computed(() =>
    LETTERS[this.game()]
      ? `var(--game-tile-${this.game()}-background)`
      : 'var(--color-surface-variant)',
  );
  protected readonly foreground = computed(() =>
    LETTERS[this.game()] ? `var(--game-tile-${this.game()}-foreground)` : 'var(--color-ink)',
  );
}
