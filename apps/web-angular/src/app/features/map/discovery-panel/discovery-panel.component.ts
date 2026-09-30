import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { CollectorMarker } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { CollectorListComponent } from '../collector-list/collector-list.component';

/**
 * Left panel of the map: the collectors as a list ("List" toggle) or, in holders mode, the
 * collectors near you who list the chosen card, with their prices. Loading, empty and error
 * states included.
 */
@Component({
  selector: 'app-discovery-panel',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    CollectorListComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <section class="panel" [attr.aria-labelledby]="'discovery-panel-title'">
      <header class="panel__head">
        <div class="panel__titles">
          <h2 class="panel__title" id="discovery-panel-title">{{ title() }}</h2>
          <p class="panel__count" aria-live="polite">{{ countLabel() }}</p>
        </div>
        <button
          matIconButton
          type="button"
          [attr.aria-label]="holders() ? 'Close the holders list' : 'Close the list'"
          (click)="closed.emit()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </header>
      @if (holders()) {
        <div class="panel__links">
          <a matButton [routerLink]="['/search']" [queryParams]="holdersQuery()">
            <mat-icon aria-hidden="true">tune</mat-icon>
            All filters
          </a>
          <button matButton type="button" (click)="clearHolders.emit()">
            <mat-icon aria-hidden="true">layers_clear</mat-icon>
            Show everyone
          </button>
        </div>
      }

      <div class="panel__body" [attr.aria-busy]="loading()">
        @if (error(); as error) {
          <app-error-state
            compact
            title="Collectors could not load"
            [message]="errorMessage()"
            [requestId]="error.requestId"
            (retry)="retry.emit()"
          />
        } @else if (loading() && !collectors().length) {
          <span class="visually-hidden">Loading collectors</span>
          <app-skeleton variant="list" lines="4" />
        } @else if (!collectors().length) {
          <app-empty-state
            [icon]="holders() ? 'search_off' : 'person_search'"
            [title]="holders() ? 'Nobody nearby lists this card yet' : 'No collectors here yet'"
            [description]="emptyHint()"
          />
        } @else {
          <app-collector-list
            [collectors]="collectors()"
            [selectedHandle]="selectedHandle()"
            [holders]="holders()"
            [signedIn]="signedIn()"
            [selfId]="selfId()"
            [label]="
              holders() ? 'Holders of ' + (holdersName() ?? 'this card') : 'Collectors on the map'
            "
            (selected)="selected.emit($event)"
          />
          @if (truncated()) {
            <p class="panel__note">
              Showing the closest {{ collectors().length }}. Zoom in to see more.
            </p>
          }
        }
      </div>
      <p class="panel__privacy">
        <mat-icon aria-hidden="true">shield_person</mat-icon>
        Places and distances are approximate to protect privacy.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--color-surface);
    }
    .panel__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-2);
      padding: var(--spacing-3) var(--spacing-2) var(--spacing-2) var(--spacing-4);
    }
    .panel__title {
      font-size: var(--font-size-lg);
    }
    .panel__count {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .panel__links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1);
      padding: 0 var(--spacing-2) var(--spacing-2);
      border-bottom: 1px solid var(--color-border);
    }
    .panel__body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: var(--spacing-3) var(--spacing-3) var(--spacing-4);
    }
    .panel__privacy {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      margin: 0;
      padding: var(--spacing-2) var(--spacing-4);
      border-top: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .panel__privacy mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      color: var(--color-accent);
    }
    .panel__note {
      margin: var(--spacing-3) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoveryPanelComponent {
  readonly collectors = input.required<readonly CollectorMarker[]>();
  readonly holders = input(false);
  /** Card (or printing) name in holders mode; `null` while unknown. */
  readonly holdersName = input<string | null>(null);
  readonly holdersQuery = input<Record<string, string>>({});
  readonly loading = input(false);
  readonly error = input<ApiError | null>(null);
  readonly total = input(0);
  readonly truncated = input(false);
  readonly radiusKm = input(10);
  readonly selectedHandle = input<string | null>(null);
  readonly signedIn = input(false);
  readonly selfId = input<string | null>(null);

  readonly selected = output<string>();
  readonly retry = output<void>();
  readonly closed = output<void>();
  readonly clearHolders = output<void>();

  protected readonly title = computed(() =>
    this.holders() ? `Holders of ${this.holdersName() ?? 'this card'}` : 'Collectors nearby',
  );
  protected readonly countLabel = computed(() => {
    if (this.loading() && !this.collectors().length) {
      return 'Searching…';
    }
    const total = this.total();
    const noun = total === 1 ? 'collector' : 'collectors';
    return `${total} ${noun} within ${this.radiusKm()} km`;
  });
  protected readonly emptyHint = computed(() =>
    this.holders()
      ? 'Try a larger distance, fewer filters, or add it to your wishlist when wishlists arrive.'
      : 'Try a larger distance, fewer filters, or another area of the map.',
  );
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
}
