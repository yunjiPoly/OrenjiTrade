import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { AdminDispute } from '@orenji/api-client';
import { ModerationHistoryComponent } from '../reports/moderation-history.component';

interface Party {
  role: 'Buyer' | 'Seller';
  id: string;
  handle: string;
  displayName: string;
  average: number | null;
  count: number;
  history: AdminDispute['buyerHistory'];
}

/**
 * Both collectors of an admin dispute: profile link, rating summary and their Phase 7 moderation
 * history (reports, ratings, suspensions, pauses, flags) in collapsible panels.
 */
@Component({
  selector: 'app-admin-dispute-parties',
  imports: [RouterLink, MatIconModule, ModerationHistoryComponent],
  template: `
    <div class="parties">
      @for (party of parties(); track party.role) {
        <section class="party admin-card" [attr.aria-label]="party.role + ' @' + party.handle">
          <p class="party__role">{{ party.role }}</p>
          <a class="party__name" [routerLink]="['/admin/users', party.id]">
            {{ party.displayName }}
            <span class="party__handle">&#64;{{ party.handle }}</span>
          </a>
          <p class="party__rating">
            <mat-icon aria-hidden="true">star</mat-icon>
            @if (party.average !== null) {
              {{ party.average.toFixed(1) }} · {{ party.count }}
              {{ party.count === 1 ? 'rating' : 'ratings' }}
            } @else {
              No ratings yet
            }
          </p>
          <details class="party__history">
            <summary>Moderation history</summary>
            <app-moderation-history [history]="party.history" />
          </details>
        </section>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .parties {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .party {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      padding: var(--spacing-4);
    }
    .party__role {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .party__name {
      font-weight: var(--font-weight-semibold);
    }
    .party__handle {
      margin-left: var(--spacing-1);
      color: var(--color-text-muted);
      font-weight: var(--font-weight-regular);
    }
    .party__rating {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .party__rating mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      color: var(--color-warning);
    }
    .party__history summary {
      cursor: pointer;
      color: var(--color-accent);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDisputePartiesComponent {
  readonly detail = input.required<AdminDispute>();

  protected readonly parties = computed<Party[]>(() => {
    const d = this.detail();
    return [
      {
        role: 'Buyer',
        ...d.dispute.buyer,
        average: d.buyerRatings.average ?? null,
        count: d.buyerRatings.count,
        history: d.buyerHistory,
      },
      {
        role: 'Seller',
        ...d.dispute.seller,
        average: d.sellerRatings.average ?? null,
        count: d.sellerRatings.count,
        history: d.sellerHistory,
      },
    ];
  });
}
