import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';

/**
 * How a deal goes, under a binder or beside a deck core (boards W8 and W9; ADR 0018): the cards
 * ship by mail, the buyer pays by e-Transfer outside OrenjiTrade, check the rating first and ask
 * for tracking. No protection is claimed.
 */
@Component({
  selector: 'app-ship-notes',
  imports: [RouterLink, ShellIconComponent],
  template: `
    <div class="ship" [class.ship--row]="variant() === 'row'">
      <p>
        <app-shell-icon name="mail" [size]="18" />
        <span>
          {{ variant() === 'row' ? 'Cards ship' : 'Ships' }} by mail. The buyer pays by e-Transfer
          outside OrenjiTrade.
        </span>
      </p>
      <p>
        <app-shell-icon class="ship__teal" name="shieldCheck" [size]="18" />
        <span>
          Check their rating before you send an e-Transfer, and ask for tracking.
          <a routerLink="/legal/trading-safely">Trading safely</a>
        </span>
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .ship {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      line-height: 20px;
    }
    .ship p {
      display: flex;
      flex: 1 1 320px;
      gap: 10px;
      margin: 0;
      padding: 14px 16px;
    }
    .ship:not(.ship--row) p + p {
      border-top: 1px solid var(--color-border);
    }
    .ship--row {
      flex-direction: row;
      flex-wrap: wrap;
      margin-top: 40px;
    }
    .ship a {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .ship__teal {
      color: var(--color-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipNotesComponent {
  readonly variant = input<'panel' | 'row'>('panel');
}
