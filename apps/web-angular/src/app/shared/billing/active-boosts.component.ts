import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { MyEntitlement } from '@orenji/api-client';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { entitlementLabel, entitlementSourceLabel } from './billing-labels';

/**
 * The member's active entitlements (`GET /me/plan` → `entitlements`): features unlocked with
 * credits, promotions and grants from the team, with their end.
 */
@Component({
  selector: 'app-active-boosts',
  imports: [DatePipe, MatIconModule, RelativeTimePipe],
  template: `
    @if (active().length) {
      <ul class="boosts" [attr.aria-label]="label()">
        @for (boost of active(); track boost.id) {
          <li class="boost" data-testid="active-boost">
            <span class="boost__icon" aria-hidden="true"><mat-icon>bolt</mat-icon></span>
            <span class="boost__body">
              <strong class="boost__name">{{ name(boost) }}</strong>
              <span class="boost__meta">
                {{ source(boost.source) }}
                @if (boost.expiresAt) {
                  · until {{ boost.expiresAt | date: 'MMM d, h:mm a' }} ({{
                    boost.expiresAt | relativeTime
                  }})
                } @else {
                  · no end date
                }
              </span>
            </span>
          </li>
        }
      </ul>
    } @else {
      <p class="boosts__none">{{ emptyText() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .boosts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .boost {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
    }
    .boost__icon {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .boost__body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .boost__meta,
    .boosts__none {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .boosts__none {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveBoostsComponent {
  readonly entitlements = input.required<readonly MyEntitlement[]>();
  readonly label = input('Active boosts');
  readonly emptyText = input('No active boosts.');

  /** Entitlements still running (the API lists only active ones; expired ones are dropped). */
  protected readonly active = computed(() => {
    const now = Date.now();
    return this.entitlements().filter(
      (entitlement) => !entitlement.expiresAt || Date.parse(entitlement.expiresAt) > now,
    );
  });

  protected name(boost: MyEntitlement): string {
    return entitlementLabel(boost.featureKey, boost.value);
  }

  protected source(source: string | undefined): string {
    return entitlementSourceLabel(source);
  }
}
