import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { PublicBinderResponse } from '@orenji/api-client';
import { CardImageComponent } from '../../shared/catalog/card-image/card-image.component';
import { distanceBucketLabel } from '../../shared/domain/location-labels';
import {
  BINDER_KIND_INFO,
  BinderKind,
  badgeFreshness,
  endsLabel,
} from '../../shared/inventory/inventory-labels';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';
import { FreshnessBadgeComponent } from '../../shared/ui/freshness-badge/freshness-badge.component';
import { GameChipComponent } from '../../shared/ui/game-chip/game-chip.component';

/**
 * Hero of a public binder: cover, name, kind, description, freshness and games, and the owner
 * card (avatar, name, handle, approximate area label and distance bucket, never a position) with
 * View profile and, for signed-in visitors, Report.
 */
@Component({
  selector: 'app-public-binder-header',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    CardImageComponent,
    FreshnessBadgeComponent,
    GameChipComponent,
  ],
  template: `
    @let b = binder();
    <header class="pb">
      <div class="pb__cover" aria-hidden="true">
        <app-card-image class="pb__card pb__card--2" [game]="secondGame()" />
        <app-card-image class="pb__card pb__card--1" [game]="firstGame()" />
        <app-card-image
          class="pb__card"
          [src]="b.coverImageUrl"
          [game]="firstGame()"
          [eager]="true"
        />
      </div>
      <div class="pb__text">
        <p class="pb__kind">
          <mat-icon aria-hidden="true">{{ kind().icon }}</mat-icon>
          {{ kind().label }} · Public binder
        </p>
        <h1 class="pb__title">{{ b.name }}</h1>
        @if (b.description) {
          <p class="pb__description">{{ b.description }}</p>
        }
        <div class="pb__facts">
          <span class="pb__fact" data-testid="binder-item-count">
            <mat-icon aria-hidden="true">style</mat-icon>
            {{ b.itemCount }} {{ b.itemCount === 1 ? 'card' : 'cards' }}
          </span>
          @if (ends(); as ends) {
            <span class="pb__fact pb__fact--timer">
              <mat-icon aria-hidden="true">timer</mat-icon>
              Public, {{ ends }}
            </span>
          }
          <app-freshness-badge [state]="freshness()" [label]="b.freshness.label" />
          @for (game of b.games; track game) {
            <app-game-chip [slug]="game" />
          }
        </div>
      </div>

      <section class="pb__owner" aria-label="Owner">
        <app-avatar
          size="lg"
          [src]="b.owner.avatarUrl"
          [name]="b.owner.displayName"
          [decorative]="true"
        />
        <div class="pb__owner-text">
          <p class="pb__owner-name">{{ b.owner.displayName }}</p>
          <p class="pb__owner-handle">&#64;{{ b.owner.handle }}</p>
          @if (b.owner.location; as location) {
            <p class="pb__owner-fact" data-testid="owner-public-label">
              <mat-icon aria-hidden="true">location_on</mat-icon>
              {{ location.publicLabel }}
            </p>
            @if (distance(); as distance) {
              <p class="pb__owner-fact" data-testid="owner-distance">
                <mat-icon aria-hidden="true">near_me</mat-icon>
                {{ distance }}
              </p>
            }
          } @else {
            <p class="pb__owner-fact pb__owner-fact--muted">
              <mat-icon aria-hidden="true">location_off</mat-icon>
              Not on the map
            </p>
          }
        </div>
        <div class="pb__owner-actions">
          @if (isOwn()) {
            <a matButton="filled" routerLink="/inventory" [queryParams]="{ binder: b.id }">
              <mat-icon aria-hidden="true">edit</mat-icon>
              Manage in inventory
            </a>
          } @else {
            <a matButton="outlined" [routerLink]="['/collectors', b.owner.handle]">
              <mat-icon aria-hidden="true">person</mat-icon>
              View profile
            </a>
            @if (signedIn()) {
              <button
                matButton
                type="button"
                class="pb__report"
                [attr.aria-label]="'Report ' + b.owner.displayName"
                (click)="reportRequested.emit()"
              >
                <mat-icon aria-hidden="true">flag</mat-icon>
                Report
              </button>
            }
          }
        </div>
      </section>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }
    .pb {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) minmax(240px, 300px);
      gap: var(--spacing-5) var(--spacing-6);
      align-items: center;
      padding: var(--spacing-6);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background:
        radial-gradient(
          circle at 0% 0%,
          color-mix(in srgb, var(--color-primary) 16%, transparent),
          transparent 50%
        ),
        var(--color-surface);
    }
    .pb__cover {
      position: relative;
      width: 132px;
      height: 176px;
    }
    .pb__card {
      position: absolute;
      inset: 0 auto auto 0;
      width: 118px;
    }
    .pb__card--1 {
      transform: translate(8px, 4px) rotate(6deg);
      opacity: 0.7;
    }
    .pb__card--2 {
      transform: translate(14px, 8px) rotate(12deg);
      opacity: 0.45;
    }
    .pb__text {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      min-width: 0;
    }
    .pb__kind {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 0;
      color: var(--color-primary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .pb__kind mat-icon,
    .pb__fact mat-icon,
    .pb__owner-fact mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .pb__title {
      font-size: var(--font-size-3xl);
    }
    .pb__description {
      margin: 0;
      color: var(--color-text-muted);
      white-space: pre-line;
    }
    .pb__facts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
    .pb__fact {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px var(--spacing-3);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-sm);
    }
    .pb__fact--timer {
      color: var(--color-primary);
    }
    .pb__owner {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-background);
    }
    .pb__owner-text p {
      margin: 0;
    }
    .pb__owner-name {
      font-family: var(--font-display);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
    }
    .pb__owner-handle {
      margin-bottom: var(--spacing-2) !important;
      color: var(--color-text-muted);
    }
    .pb__owner-fact {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-sm);
    }
    .pb__owner-fact mat-icon {
      color: var(--color-primary);
    }
    .pb__owner-fact--muted,
    .pb__owner-fact--muted mat-icon {
      color: var(--color-text-muted);
    }
    .pb__owner-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .pb__report {
      color: var(--color-text-muted);
    }
    @media (max-width: 1023px) {
      .pb {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .pb__owner {
        grid-column: 1 / -1;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
      }
      .pb__owner-text {
        flex: 1 1 200px;
      }
    }
    @media (max-width: 599px) {
      .pb {
        grid-template-columns: 1fr;
        padding: var(--spacing-4);
      }
      .pb__cover {
        width: 96px;
        height: 128px;
      }
      .pb__card {
        width: 86px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicBinderHeaderComponent {
  readonly binder = input.required<PublicBinderResponse>();
  readonly isOwn = input(false, { transform: booleanAttribute });
  /** Signed-in visitors may report the owner. */
  readonly signedIn = input(false, { transform: booleanAttribute });
  /** "Report" pressed on the owner card. */
  readonly reportRequested = output<void>();

  protected readonly kind = computed(
    () => BINDER_KIND_INFO[this.binder().kind as BinderKind] ?? BINDER_KIND_INFO.CUSTOM,
  );
  protected readonly freshness = computed(() => badgeFreshness(this.binder().freshness.state));
  protected readonly distance = computed(() =>
    distanceBucketLabel(this.binder().owner.location?.distanceBucket),
  );
  protected readonly ends = computed(() => endsLabel(this.binder().publicUntil));
  protected readonly firstGame = computed(() => this.binder().games.at(0) ?? '');
  protected readonly secondGame = computed(
    () => this.binder().games.at(1) ?? this.binder().games.at(0) ?? '',
  );
}
