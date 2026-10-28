import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { GameContext } from '../../game/game-context.service';
import { PopoverRef, Popovers } from '../popover/popover.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/** "Game: Yu-Gi-Oh!. Change game" (the phone's GAME_COPY.pillLabel). */
export function gamePillLabel(name: string): string {
  return `Game: ${name}. Change game`;
}

/**
 * The top bar's game pill (spec 4.2): a 22 px monogram tile, the browsed game and a chevron, 8 px
 * after the region pill; compact at md. Opens "Choose a game" (a lazy chunk).
 */
@Component({
  selector: 'app-game-pill',
  imports: [ShellIconComponent],
  template: `
    <button
      #pill
      type="button"
      class="pill pill--game"
      data-testid="game-pill"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label()"
      [attr.title]="info().shortLabel"
      (click)="toggle()"
    >
      <span
        class="pill__tile"
        aria-hidden="true"
        [style.background]="'var(--game-tile-' + info().tileKey + '-background)'"
        [style.color]="'var(--game-tile-' + info().tileKey + '-foreground)'"
        >{{ info().letter }}</span
      >
      <span class="pill__name">{{ info().shortLabel }}</span>
      <app-shell-icon
        class="pill__chevron"
        [class.pill__chevron--open]="open()"
        name="chevronDown"
        [size]="16"
        [stroke]="2"
      />
    </button>
  `,
  styleUrl: '../top-bar/pill.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePillComponent {
  private readonly context = inject(GameContext);
  private readonly popovers = inject(Popovers);
  private readonly pill = viewChild.required<ElementRef<HTMLButtonElement>>('pill');
  protected readonly open = signal(false);
  private ref: PopoverRef | null = null;

  protected readonly info = this.context.info;
  protected readonly label = computed(() => gamePillLabel(this.info().shortLabel));

  protected async toggle(): Promise<void> {
    if (this.ref) {
      this.ref.close();
      return;
    }
    this.open.set(true);
    try {
      const { GamePopoverComponent } = await import('./game-popover.component');
      const ref = this.popovers.open(this.pill().nativeElement, GamePopoverComponent);
      this.ref = ref;
      ref.closed$.subscribe(() => {
        this.ref = null;
        this.open.set(false);
      });
    } catch {
      this.open.set(false);
    }
  }
}
