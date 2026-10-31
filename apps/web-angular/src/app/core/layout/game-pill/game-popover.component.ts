import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { InventoryService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../auth/session.service';
import { GameContext } from '../../game/game-context.service';
import { silentErrors } from '../../http/http-context';
import { PopoverRef } from '../popover/popover.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/** "17 of your cards" or "None of your cards yet" (the phone's GAME_COPY.yourCards). */
export function yourCards(count: number): string {
  return count > 0 ? `${count} of your cards` : 'None of your cards yet';
}

export const COMING_SOON = 'Cards coming soon';

/**
 * "Choose a game" (spec 4.5, board W3): every game with its monogram; the games the web can
 * browse with "{n} of your cards" for a signed-in collector (`GET /inventory/summary`), the
 * games without cards yet (`hasCards`) dimmed with "Cards coming soon" and `aria-disabled` (web
 * stage WD). Arrow keys move, Enter picks and closes, Esc closes. Lazy chunk of the game pill.
 */
@Component({
  selector: 'app-game-popover',
  imports: [CdkTrapFocus, ShellIconComponent],
  template: `
    <div
      class="pop"
      role="dialog"
      aria-modal="true"
      cdkTrapFocus
      aria-labelledby="game-pop-title"
      aria-describedby="game-pop-lead"
    >
      <h2 class="pop__title" id="game-pop-title">Choose a game</h2>
      <p class="pop__lead" id="game-pop-lead">Home and Search show one game at a time.</p>
      <div class="pop__rows" role="radiogroup" aria-labelledby="game-pop-title">
        @for (option of context.options(); track option.game.slug) {
          <button
            type="button"
            role="radio"
            class="pop__row pop__row--game"
            [attr.aria-checked]="option.game.slug === context.current()"
            [attr.aria-disabled]="option.available ? null : 'true'"
            [attr.tabindex]="option.game.slug === context.current() ? 0 : -1"
            [attr.data-game]="option.game.slug"
            [attr.aria-label]="rowLabel(option.game.shortLabel, option.game.slug, option.available)"
            (click)="pick(option.game.slug, option.available)"
          >
            <span
              class="pop__tile"
              aria-hidden="true"
              [style.background]="'var(--game-tile-' + option.game.tileKey + '-background)'"
              [style.color]="'var(--game-tile-' + option.game.tileKey + '-foreground)'"
              >{{ option.game.letter }}</span
            >
            <span class="pop__text">
              <span class="pop__name">{{ option.game.shortLabel }}</span>
              @if (!option.available) {
                <span class="pop__line">{{ comingSoon }}</span>
              } @else if (counts(); as byGame) {
                <span class="pop__line">{{ yourCards(byGame[option.game.slug] ?? 0) }}</span>
              }
            </span>
            @if (option.available) {
              <span
                class="pop__radio"
                [class.pop__radio--on]="option.game.slug === context.current()"
                aria-hidden="true"
              ></span>
            }
          </button>
        }
      </div>
      <p class="pop__foot">
        Your inventory keeps every game, with binders grouped by game. Chats and the bell show every
        game.
      </p>
      <button type="button" class="pop__close" aria-label="Close" (click)="ref.close()">
        <app-shell-icon name="close" [size]="18" />
      </button>
    </div>
  `,
  styleUrl: '../popover/popover-rows.scss',
  host: { '(keydown)': 'onKeydown($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePopoverComponent {
  protected readonly ref = inject(PopoverRef);
  protected readonly context = inject(GameContext);
  private readonly session = inject(SessionService);
  private readonly inventory = inject(InventoryService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly comingSoon = COMING_SOON;
  protected readonly yourCards = yourCards;
  /** Cards per game of a signed-in collector; null for a guest or until read (no count shown). */
  protected readonly counts = signal<Record<string, number> | null>(null);
  private readonly signedIn = computed(() => this.session.status() === 'ready');

  constructor() {
    if (this.signedIn()) {
      void firstValueFrom(
        this.inventory.getInventorySummary('body', false, { context: silentErrors() }),
      )
        .then((summary) => this.counts.set(summary.byGame ?? {}))
        .catch(() => this.counts.set(null));
    }
    afterNextRender(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
        ?.focus(),
    );
  }

  /** "Yu-Gi-Oh!, 17 of your cards", "One Piece, Cards coming soon", or the name alone. */
  protected rowLabel(name: string, slug: string, available: boolean): string {
    if (!available) {
      return `${name}, ${COMING_SOON}`;
    }
    const counts = this.counts();
    return counts ? `${name}, ${yourCards(counts[slug] ?? 0)}` : name;
  }

  protected pick(slug: string, available: boolean): void {
    if (!available) {
      return;
    }
    this.context.select(slug);
    this.ref.close();
  }

  /** Arrow keys move between the games that can be picked (one tab stop). */
  protected onKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const radios = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[role="radio"]'),
    );
    const index = radios.indexOf(
      this.host.nativeElement.ownerDocument.activeElement as HTMLElement,
    );
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? radios.length - 1
          : (index + step + radios.length) % radios.length;
    radios.forEach((radio, i) => radio.setAttribute('tabindex', i === next ? '0' : '-1'));
    radios[next]?.focus();
  }
}
