import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { AdminListingItem, ListingOwner } from '@orenji/api-client';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { AdminChipComponent, ChipTone } from '../shared/admin-chip.component';

/** The fields shared by `AdminListing` and `StaleListing`. */
export interface ListingRow {
  item: AdminListingItem;
  owner: ListingOwner;
  confirmedAt: string;
  /** Freshness state: ACTIVE, AGING, STALE or HIDDEN. */
  state: string;
  warnedAt?: string | null;
}

const STATE_LABELS: Record<string, string> = {
  ACTIVE: 'Fresh',
  AGING: 'Aging',
  STALE: 'Stale',
  HIDDEN: 'Hidden',
};

const STATE_TONES: Record<string, ChipTone> = {
  ACTIVE: 'success',
  AGING: 'warning',
  STALE: 'danger',
  HIDDEN: 'neutral',
};

const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: 'Private',
  PUBLIC: 'Public',
  TEMPORARILY_PUBLIC: 'Temporarily public',
};

export function listingStateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

/**
 * Listing rows of the admin console (review queue and search): card, owner, binder, freshness
 * state, last confirmation and warning, price, visibility, with Restore (confirm on the owner's
 * behalf) and Hide (make private). Private notes never reach the console.
 */
@Component({
  selector: 'app-admin-listing-rows',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AdminChipComponent,
    GameChipComponent,
    RelativeTimePipe,
  ],
  template: `
    <ul class="rows" [attr.aria-label]="label()">
      @for (row of rows(); track row.item.id) {
        <li class="row" [attr.data-listing]="row.item.id">
          <div class="row__card">
            <p class="row__name">
              {{ row.item.cardName }}
              @if (row.item.printingCode) {
                <span class="row__code">{{ row.item.printingCode }}</span>
              }
            </p>
            <p class="row__meta">
              <app-game-chip [slug]="row.item.game" />
              <span>×{{ row.item.quantity }}</span>
              @if (row.item.askingPrice !== null && row.item.askingPrice !== undefined) {
                <span>{{ row.item.askingPrice | currency: row.item.currency }}</span>
              }
              <span>{{ visibility(row.item.visibility) }}</span>
              @if (row.item.binderName) {
                <span>
                  <mat-icon aria-hidden="true">menu_book</mat-icon>{{ row.item.binderName }}
                </span>
              }
            </p>
          </div>
          <div class="row__owner">
            <a [routerLink]="['/admin/users', row.owner.id]">&#64;{{ row.owner.handle }}</a>
            <span class="row__when" [title]="row.confirmedAt | date: 'medium'">
              confirmed {{ row.confirmedAt | relativeTime }}
            </span>
            @if (row.warnedAt) {
              <span class="row__when">warned {{ row.warnedAt | relativeTime }}</span>
            }
          </div>
          <app-admin-chip class="row__state" [tone]="tone(row.state)">{{
            stateLabel(row.state)
          }}</app-admin-chip>
          <div class="row__actions">
            @if (row.state !== 'ACTIVE') {
              <button
                matButton="outlined"
                type="button"
                [disabled]="busy() === row.item.id"
                [attr.aria-label]="'Restore ' + row.item.cardName + ' of @' + row.owner.handle"
                (click)="restore.emit(row)"
              >
                <mat-icon aria-hidden="true">restore</mat-icon>
                Restore
              </button>
            }
            @if (row.item.visibility !== 'PRIVATE') {
              <button
                matButton
                type="button"
                class="row__hide"
                [disabled]="busy() === row.item.id"
                [attr.aria-label]="'Hide ' + row.item.cardName + ' of @' + row.owner.handle"
                (click)="hide.emit(row)"
              >
                <mat-icon aria-hidden="true">visibility_off</mat-icon>
                Hide
              </button>
            }
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .row p {
      margin: 0;
    }
    .row__name {
      font-weight: var(--font-weight-semibold);
    }
    .row__code {
      margin-left: var(--spacing-1);
      color: var(--color-text-muted);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .row__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1) var(--spacing-3);
      margin-top: 4px !important;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .row__meta span {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .row__meta mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .row__owner {
      display: flex;
      flex-direction: column;
      font-size: var(--font-size-sm);
    }
    .row__when {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .row__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--spacing-1);
    }
    .row__hide {
      color: var(--color-danger);
    }
    @media (max-width: 839px) {
      .row {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .row__actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminListingRowsComponent {
  readonly rows = input.required<readonly ListingRow[]>();
  readonly label = input('Listings');
  /** Item id being changed. */
  readonly busy = input<string | null>(null);
  readonly restore = output<ListingRow>();
  readonly hide = output<ListingRow>();

  protected readonly stateLabel = listingStateLabel;

  protected tone(state: string): ChipTone {
    return STATE_TONES[state] ?? 'neutral';
  }

  protected visibility(value: string): string {
    return VISIBILITY_LABELS[value] ?? value;
  }
}
