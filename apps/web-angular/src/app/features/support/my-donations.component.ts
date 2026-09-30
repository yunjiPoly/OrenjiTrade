import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { Donation } from '@orenji/api-client';
import { amountLabel, donationStatusInfo } from '../../shared/billing/billing-labels';
import { StatusChipComponent } from '../../shared/offers/status-chip.component';

/** The member's own donations, newest first, with their status. */
@Component({
  selector: 'app-my-donations',
  imports: [DatePipe, MatIconModule, StatusChipComponent],
  template: `
    @if (donations().length) {
      <ul class="mine" aria-label="Your donations">
        @for (donation of donations(); track donation.id) {
          <li class="mine__row" data-testid="my-donation">
            <span class="mine__amount">{{ amount(donation) }}</span>
            <span class="mine__meta">
              {{ donation.createdAt | date: 'mediumDate' }}
              @if (donation.publicThanks) {
                · <mat-icon aria-hidden="true">campaign</mat-icon> thanked publicly
              }
              @if (donation.message) {
                · “{{ donation.message }}”
              }
            </span>
            <app-status-chip
              [label]="status(donation).label"
              [icon]="status(donation).icon"
              [tone]="status(donation).tone"
            />
          </li>
        }
      </ul>
    } @else {
      <p class="mine__none">You have not donated yet. Every bit helps keep OrenjiTrade running.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .mine {
      margin: 0;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      list-style: none;
      overflow: hidden;
    }
    .mine__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      background: var(--color-surface);
    }
    .mine__row + .mine__row {
      border-top: 1px solid var(--color-border);
    }
    .mine__amount {
      min-width: 90px;
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .mine__meta {
      display: inline-flex;
      flex: 1 1 200px;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      min-width: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .mine__meta mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .mine__none {
      margin: 0;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyDonationsComponent {
  readonly donations = input.required<readonly Donation[]>();

  protected amount(donation: Donation): string {
    return amountLabel(donation.amount, donation.currency);
  }

  protected status(donation: Donation) {
    return donationStatusInfo(donation.status);
  }
}
