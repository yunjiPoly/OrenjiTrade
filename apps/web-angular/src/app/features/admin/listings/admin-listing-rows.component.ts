import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminListingItem, ListingOwner } from '@orenji/api-client';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { GameBadgeComponent } from '../console/game-badge.component';
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
 * Listing rows of the admin console (review queue and search): card picture and name, owner,
 * binder, freshness state, last confirmation and warning, price, visibility, with Restore (confirm
 * on the owner's behalf) and Hide (make private). Private notes never reach the console.
 */
@Component({
  selector: 'app-admin-listing-rows',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    AdminChipComponent,
    CardImageComponent,
    GameBadgeComponent,
    RelativeTimePipe,
  ],
  template: `
    <div class="ct">
      <table class="lt" [attr.aria-label]="label()">
        <thead>
          <tr>
            <th scope="col">Card</th>
            <th scope="col">Copies and price</th>
            <th scope="col">Where</th>
            <th scope="col">Owner</th>
            <th scope="col">Last confirmed</th>
            <th scope="col">State</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.item.id) {
            <tr class="row" [attr.data-listing]="row.item.id">
              <td>
                <div class="row__card">
                  <app-card-image
                    class="row__thumb"
                    size="sm"
                    data-testid="admin-listing-image"
                    [src]="row.item.imageUrl"
                    [alt]="row.item.cardName"
                    [game]="row.item.game"
                  />
                  <div class="row__info">
                    <p class="row__name">{{ row.item.cardName }}</p>
                    <p class="row__meta">
                      <app-game-badge [game]="row.item.game" size="sm" />
                      @if (row.item.printingCode) {
                        <span class="row__code">{{ row.item.printingCode }}</span>
                      }
                    </p>
                  </div>
                </div>
              </td>
              <td class="ct__num">
                ×{{ row.item.quantity }}
                <span class="ct__sub">
                  @if (row.item.askingPrice !== null && row.item.askingPrice !== undefined) {
                    {{ row.item.askingPrice | currency: row.item.currency }}
                  } @else {
                    No price
                  }
                </span>
              </td>
              <td>
                {{ visibility(row.item.visibility) }}
                @if (row.item.binderName) {
                  <span class="ct__sub">{{ row.item.binderName }}</span>
                }
              </td>
              <td>
                <a class="ct__name row__owner" [routerLink]="['/admin/users', row.owner.id]"
                  >&#64;{{ row.owner.handle }}</a
                >
              </td>
              <td>
                <span [title]="row.confirmedAt | date: 'medium'"
                  >Confirmed {{ row.confirmedAt | relativeTime }}</span
                >
                <span class="ct__sub">
                  @if (row.warnedAt) {
                    Reminded {{ row.warnedAt | relativeTime }}
                  } @else {
                    No reminder yet
                  }
                </span>
              </td>
              <td>
                <app-admin-chip class="row__state" [tone]="tone(row.state)">{{
                  stateLabel(row.state)
                }}</app-admin-chip>
              </td>
              <td class="row__actions">
                @if (row.state !== 'ACTIVE') {
                  <button
                    type="button"
                    class="cb cb--outline cb--small"
                    [attr.aria-disabled]="busy() === row.item.id ? 'true' : null"
                    [attr.aria-label]="'Restore ' + row.item.cardName + ' of @' + row.owner.handle"
                    (click)="busy() === row.item.id || restore.emit(row)"
                  >
                    Restore
                  </button>
                }
                @if (row.item.visibility !== 'PRIVATE') {
                  <button
                    type="button"
                    class="cb cb--quiet cb--small row__hide"
                    [attr.aria-disabled]="busy() === row.item.id ? 'true' : null"
                    [attr.aria-label]="'Hide ' + row.item.cardName + ' of @' + row.owner.handle"
                    (click)="busy() === row.item.id || hide.emit(row)"
                  >
                    Hide
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrls: ['../console/console-controls.scss', '../console/console-table.scss'],
  styles: `
    :host {
      display: block;
    }
    .lt {
      min-width: 1000px;
    }
    .row__card {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .row__thumb {
      flex: none;
      width: 40px;
    }
    .row__info {
      min-width: 0;
    }
    .row__info p {
      margin: 0;
    }
    .row__name {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .row__meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
    }
    .row__code {
      color: var(--color-text-secondary);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .row__owner {
      color: var(--color-accent);
    }
    .row__actions {
      white-space: nowrap;
      text-align: right;
    }
    .row__hide {
      color: var(--app-danger-text);
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
