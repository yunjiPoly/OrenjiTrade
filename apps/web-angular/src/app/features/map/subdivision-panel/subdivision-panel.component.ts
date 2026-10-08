import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { PublicBinderCardComponent } from '../../../shared/inventory/public-binder-card/public-binder-card.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { SubdivisionBinders } from '../data/region-map.store';

/**
 * Public binders of one state/province (ADR 0017), opened from the map or the list: a cursor list
 * with skeleton, empty and error states, "Show more" and a sponsored slot (`[sponsored]`). Owners
 * show their handle and state/province only.
 */
@Component({
  selector: 'app-subdivision-panel',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PublicBinderCardComponent,
    SkeletonComponent,
  ],
  template: `
    <section class="sdp" aria-labelledby="sdp-title" data-testid="subdivision-panel">
      <header class="sdp__header">
        <button matIconButton type="button" aria-label="Back to the list" (click)="closed.emit()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="sdp__heading">
          <h2 id="sdp-title" class="sdp__title" tabindex="-1" #heading>{{ title() }}</h2>
          <p class="sdp__subtitle">{{ subtitle() }}</p>
        </div>
      </header>

      <ng-content select="[sponsored]" />

      @let state = binders();
      @if (!state || state.loading) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading binders</span>
          <app-skeleton variant="list" lines="4" />
        </div>
      } @else if (state.error && state.items.length === 0) {
        <app-error-state
          compact
          title="We could not load these binders"
          [message]="state.error.message"
          [requestId]="state.error.requestId"
          (retry)="retry.emit()"
        />
      } @else if (state.items.length === 0) {
        <app-empty-state
          icon="menu_book"
          title="No public binders here yet"
          description="Binders appear here while their owner is discoverable and keeps them public and fresh."
        />
      } @else {
        <ul class="sdp__list" aria-label="Public binders">
          @for (binder of state.items; track binder.id) {
            <li class="sdp__item">
              <app-public-binder-card [binder]="binder" />
              @if (binder.owner; as owner) {
                <a class="sdp__owner" [routerLink]="['/collectors', owner.handle]">
                  <app-avatar
                    size="xs"
                    [src]="owner.avatarUrl"
                    [name]="owner.displayName"
                    [decorative]="true"
                  />
                  <span class="sdp__owner-name">{{ owner.displayName }}</span>
                  <span class="sdp__owner-handle">&#64;{{ owner.handle }}</span>
                </a>
              }
            </li>
          }
        </ul>
        @if (state.error) {
          <app-error-state
            compact
            title="We could not load more binders"
            [message]="state.error.message"
            (retry)="retry.emit()"
          />
        } @else if (state.nextCursor) {
          <button
            matButton="tonal"
            type="button"
            class="sdp__more"
            [disabled]="state.loadingMore"
            (click)="loadMore.emit()"
          >
            @if (state.loadingMore) {
              <mat-spinner diameter="18" aria-hidden="true" />
            }
            Show more binders
          </button>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sdp {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .sdp__header {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-1);
    }
    .sdp__heading {
      min-width: 0;
    }
    .sdp__title {
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .sdp__title:focus {
      outline: none;
    }
    .sdp__subtitle {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .sdp__list {
      display: grid;
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .sdp__item {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .sdp__owner {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .sdp__owner:hover .sdp__owner-name {
      text-decoration: underline;
    }
    .sdp__owner-name {
      font-weight: var(--font-weight-medium);
    }
    .sdp__owner-handle {
      color: var(--color-text-muted);
    }
    .sdp__more {
      align-self: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubdivisionPanelComponent {
  /** "Quebec, Canada". */
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly binders = input<SubdivisionBinders | null>(null);
  readonly closed = output<void>();
  readonly loadMore = output<void>();
  readonly retry = output<void>();

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  constructor() {
    // Opening a state moves the focus to its heading (keyboard and screen-reader users land here).
    effect(() => {
      this.title();
      const heading = this.heading();
      untracked(() => heading?.nativeElement.focus({ preventScroll: true }));
    });
  }
}
