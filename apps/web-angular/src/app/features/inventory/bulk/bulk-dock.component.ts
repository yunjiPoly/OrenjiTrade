import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { BinderResponse, InventoryItemResponse } from '@orenji/api-client';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { binderGame, groupBindersByGame, onlyGameLabel } from '../data/binder-games';
import { BulkAction } from '../data/bulk-actions';

/**
 * The bulk dock (spec 9.6): floating at the bottom of the list, "6 selected" · Make public · Make
 * private · Move to binder ▾ · Still have them · Delete · Clear (Esc). Move to binder lists the
 * binders by game, "Unfiled" and "New binder…"; a binder of none of the selected cards' games is
 * dimmed, "Only Pokémon cards can go in". "Set price" stays hidden until the additive bulk action
 * exists (decision 19). At md the actions after the third are icons with their label in a tooltip.
 */
@Component({
  selector: 'app-bulk-dock',
  imports: [MatIconModule, MatMenuModule, MatTooltipModule, GameMonogramComponent],
  template: `
    <div class="dock" role="toolbar" aria-label="Selected cards" [class.dock--compact]="compact()">
      <span class="dock__count" aria-live="polite" data-testid="bulk-count"
        >{{ count() }} selected</span
      >
      <span class="dock__sep" aria-hidden="true"></span>
      <button
        type="button"
        class="dock__btn"
        [disabled]="busy()"
        (click)="emit({ kind: 'visibility', visibility: 'PUBLIC' })"
      >
        Make public
      </button>
      <button
        type="button"
        class="dock__btn"
        [disabled]="busy()"
        (click)="emit({ kind: 'visibility', visibility: 'PRIVATE' })"
      >
        Make private
      </button>
      <button
        type="button"
        class="dock__btn"
        [disabled]="busy()"
        [matMenuTriggerFor]="moveMenu"
        data-testid="bulk-move"
      >
        Move to binder
        <mat-icon aria-hidden="true">expand_more</mat-icon>
      </button>
      <button
        type="button"
        class="dock__btn"
        [disabled]="busy()"
        [matTooltip]="compact() ? 'Still have them' : ''"
        [attr.aria-label]="compact() ? 'Still have them' : null"
        (click)="emit({ kind: 'confirm' })"
      >
        @if (compact()) {
          <mat-icon aria-hidden="true">task_alt</mat-icon>
        } @else {
          Still have them
        }
      </button>
      <button
        type="button"
        class="dock__btn dock__btn--danger"
        [disabled]="busy()"
        [matTooltip]="compact() ? 'Delete' : ''"
        [attr.aria-label]="compact() ? 'Delete' : null"
        (click)="emit({ kind: 'delete' })"
        data-testid="bulk-delete"
      >
        @if (compact()) {
          <mat-icon aria-hidden="true">delete</mat-icon>
        } @else {
          Delete
        }
      </button>
      <span class="dock__sep" aria-hidden="true"></span>
      <button type="button" class="dock__btn dock__btn--clear" (click)="clear.emit()">
        Clear <kbd>Esc</kbd>
      </button>
    </div>

    <mat-menu #moveMenu="matMenu" class="bulk-move-menu">
      @for (group of groups(); track group.game) {
        <div class="menu-head" role="presentation">
          <app-game-monogram [game]="group.game" size="16" />
          {{ group.info.label }}
        </div>
        @for (binder of group.binders; track binder.id) {
          <button mat-menu-item type="button" [disabled]="!takes(binder)" (click)="move(binder)">
            <span class="menu-binder">
              <span>{{ binder.name }}</span>
              @if (!takes(binder)) {
                <span class="menu-hint">{{ only(binder) }}</span>
              }
            </span>
          </button>
        }
      }
      <button
        mat-menu-item
        type="button"
        (click)="emit({ kind: 'move', binderId: null, binderName: null })"
      >
        <mat-icon>inbox</mat-icon><span>Unfiled</span>
      </button>
      <button mat-menu-item type="button" (click)="newBinder.emit()">
        <mat-icon>add</mat-icon><span>New binder…</span>
      </button>
    </mat-menu>
  `,
  styles: `
    :host {
      display: block;
    }
    .dock {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      max-width: calc(100vw - 32px);
      min-height: 56px;
      padding: 0 8px 0 20px;
      overflow-x: auto;
      border: 1px solid var(--color-border-strong);
      border-radius: 999px;
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
    }
    .dock__count {
      padding-right: 8px;
      color: var(--color-ink);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-bold);
      white-space: nowrap;
    }
    .dock__sep {
      width: 1px;
      height: 24px;
      margin: 0 6px;
      background: var(--color-border-strong);
    }
    .dock__btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 40px;
      padding: 0 10px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
      cursor: pointer;
    }
    .dock__btn:hover:not(:disabled) {
      background: var(--color-surface-variant);
    }
    .dock__btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .dock__btn:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .dock__btn mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .dock__btn--danger {
      color: var(--color-danger);
    }
    .dock__btn--clear {
      color: var(--color-text-secondary);
    }
    kbd {
      padding: 1px 5px;
      border: 1px solid var(--color-border-strong);
      border-radius: 5px;
      font-family: var(--font-mono);
      font-size: var(--font-size-tag);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkDockComponent {
  readonly count = input.required<number>();
  readonly selected = input<readonly InventoryItemResponse[]>([]);
  readonly binders = input<readonly BinderResponse[]>([]);
  readonly busy = input(false, { transform: booleanAttribute });
  readonly compact = input(false, { transform: booleanAttribute });
  readonly action = output<BulkAction>();
  readonly clear = output<void>();
  readonly newBinder = output<void>();

  protected readonly groups = computed(() => groupBindersByGame(this.binders()));
  private readonly games = computed(() => new Set(this.selected().map((item) => item.card.game)));

  protected takes(binder: BinderResponse): boolean {
    const game = binderGame(binder);
    return !game || this.games().size === 0 || this.games().has(game);
  }

  protected only(binder: BinderResponse): string {
    return onlyGameLabel(binderGame(binder));
  }

  protected move(binder: BinderResponse): void {
    this.emit({
      kind: 'move',
      binderId: binder.id,
      binderName: binder.name,
      binderGame: binderGame(binder),
    });
  }

  protected emit(action: BulkAction): void {
    this.action.emit(action);
  }
}
