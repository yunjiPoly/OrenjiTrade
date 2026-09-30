import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { OfferParty } from '@orenji/api-client';
import { ratingLabel } from '../discovery/discovery-labels';
import { distanceBucketLabel } from '../domain/location-labels';
import { StarRatingComponent } from '../ratings/star-rating.component';
import { AvatarComponent } from '../ui/avatar/avatar.component';

/**
 * One party of an offer or a trade: avatar, name (links to the profile), role, approximate place
 * (region label and distance bucket only, ADR 0004) and rating summary.
 */
@Component({
  selector: 'app-offer-party-card',
  imports: [RouterLink, MatIconModule, AvatarComponent, StarRatingComponent],
  template: `
    @let p = party();
    <article class="party" [attr.aria-label]="role() + ': ' + p.displayName">
      <app-avatar [src]="p.avatarUrl" [name]="p.displayName" [decorative]="true" />
      <div class="party__body">
        <p class="party__role">
          {{ role() }}
          @if (isYou()) {
            <span class="party__you">You</span>
          }
        </p>
        <a class="party__name" [routerLink]="['/collectors', p.handle]">{{ p.displayName }}</a>
        @if (p.location; as location) {
          <p class="party__place">
            <mat-icon aria-hidden="true">location_on</mat-icon>
            {{ location.publicLabel }}
            @if (distance(); as distance) {
              · {{ distance }}
            }
          </p>
        }
        <p class="party__rating">
          @if (p.rating.count > 0) {
            <app-star-rating size="sm" [value]="p.rating.average" />
          }
          <span>{{ rating() }}</span>
        </p>
      </div>
    </article>
  `,
  styles: `
    .party {
      display: flex;
      gap: var(--spacing-3);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .party__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .party__role {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .party__you {
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
      letter-spacing: normal;
      text-transform: none;
    }
    .party__name {
      overflow: hidden;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .party__place,
    .party__rating {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .party__place mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferPartyCardComponent {
  readonly party = input.required<OfferParty>();
  /** "Seller" / "Buyer". */
  readonly role = input('Collector');
  readonly isYou = input(false);

  protected readonly distance = computed(() =>
    distanceBucketLabel(this.party().location?.distanceBucket),
  );
  protected readonly rating = computed(() => ratingLabel(this.party().rating));
}
