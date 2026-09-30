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
import type { BinderResponse } from '@orenji/api-client';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { VisibilityBadgeComponent } from '../../../shared/ui/visibility-badge/visibility-badge.component';
import { UNFILED } from '../data/inventory-params';
import { VisibilityStatus, binderVisibilityStatus } from '../data/visibility-status';

interface BinderEntry {
  binder: BinderResponse;
  status: VisibilityStatus;
}

/**
 * Left column of `/inventory`: All cards, Unfiled, then the binders (visibility icon, public and
 * total counts) as links that keep the other filters, plus "New binder" and "Manage binders".
 * Becomes a horizontal strip on phones.
 */
@Component({
  selector: 'app-binder-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    SkeletonComponent,
    VisibilityBadgeComponent,
  ],
  template: `
    <nav class="bl" aria-label="Binders">
      <ul class="bl__list">
        <li>
          <a
            class="bl__link"
            routerLink="."
            [queryParams]="{ binder: null, page: null }"
            queryParamsHandling="merge"
            [attr.aria-current]="selected() === null ? 'page' : null"
          >
            <mat-icon class="bl__icon" aria-hidden="true">style</mat-icon>
            <span class="bl__name">All cards</span>
            <span class="bl__count">{{ totalItems() ?? '' }}</span>
          </a>
        </li>
        <li>
          <a
            class="bl__link"
            routerLink="."
            [queryParams]="{ binder: unfiled, page: null }"
            queryParamsHandling="merge"
            [attr.aria-current]="selected() === unfiled ? 'page' : null"
          >
            <mat-icon class="bl__icon" aria-hidden="true">inbox</mat-icon>
            <span class="bl__name">Unfiled</span>
            <span class="bl__count">{{ unfiledCount() ?? '' }}</span>
          </a>
        </li>
      </ul>

      <div class="bl__heading">
        <h2 class="bl__title">Binders</h2>
        <button
          matIconButton
          type="button"
          class="bl__manage"
          aria-label="Reorder and manage binders"
          (click)="manage.emit()"
        >
          <mat-icon>tune</mat-icon>
        </button>
      </div>

      @if (binders(); as list) {
        @if (list.length === 0) {
          <p class="bl__empty">Group cards into binders, then publish the ones you trade.</p>
        }
        <ul class="bl__list" aria-label="Your binders">
          @for (entry of entries(); track entry.binder.id) {
            <li>
              <a
                class="bl__link"
                routerLink="."
                [queryParams]="{ binder: entry.binder.id, page: null }"
                queryParamsHandling="merge"
                [attr.aria-current]="selected() === entry.binder.id ? 'page' : null"
              >
                <app-visibility-badge
                  class="bl__vis"
                  [focusable]="false"
                  [visibility]="entry.status.visibility"
                  [pending]="entry.status.pending"
                  [label]="entry.status.label"
                  [note]="entry.status.note"
                />
                <span class="bl__name">{{ entry.binder.name }}</span>
                <span
                  class="bl__count"
                  [attr.aria-label]="
                    entry.binder.itemCount + ' cards, ' + entry.binder.publicItemCount + ' public'
                  "
                  >{{ entry.binder.itemCount }}</span
                >
              </a>
            </li>
          }
        </ul>
      } @else if (error()) {
        <p class="bl__empty">
          Binders could not load.
          <button matButton type="button" (click)="retry.emit()">Retry</button>
        </p>
      } @else {
        <app-skeleton variant="list" lines="3" />
      }

      <button matButton="tonal" type="button" class="bl__new" (click)="newBinder.emit()">
        <mat-icon aria-hidden="true">add</mat-icon>
        New binder
      </button>
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    .bl {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .bl__list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .bl__link {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      min-height: 40px;
      padding: 4px var(--spacing-2);
      border-radius: var(--radius-md);
      color: var(--color-ink);
      text-decoration: none;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .bl__link:hover {
      background: var(--color-surface-variant);
    }
    .bl__link[aria-current='page'] {
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-weight: var(--font-weight-semibold);
    }
    .bl__icon {
      width: 22px;
      height: 22px;
      font-size: 20px;
      text-align: center;
      color: var(--color-text-muted);
    }
    .bl__name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bl__count {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-variant-numeric: tabular-nums;
    }
    .bl__heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--spacing-2);
      padding-left: var(--spacing-2);
    }
    .bl__title {
      font-family: var(--font-body);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .bl__empty {
      margin: 0;
      padding: 0 var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .bl__new {
      margin-top: var(--spacing-2);
    }
    @media (max-width: 959px) {
      .bl {
        flex-direction: row;
        align-items: center;
        overflow-x: auto;
        padding: var(--spacing-2);
        scrollbar-width: thin;
      }
      .bl__list {
        flex-direction: row;
        flex: 0 0 auto;
      }
      .bl__link {
        white-space: nowrap;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
      }
      .bl__name {
        overflow: visible;
      }
      .bl__heading,
      .bl__empty {
        display: none;
      }
      .bl__new {
        flex: 0 0 auto;
        margin-top: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderListComponent {
  readonly binders = input<readonly BinderResponse[] | null>(null);
  /** Binder id, `unfiled`, or `null` for every card. */
  readonly selected = input<string | null>(null);
  readonly totalItems = input<number | null>(null);
  readonly unfiledCount = input<number | null>(null);
  readonly ownerVisible = input<boolean | null>(null);
  readonly error = input(false, { transform: booleanAttribute });
  readonly newBinder = output<void>();
  readonly manage = output<void>();
  readonly retry = output<void>();

  protected readonly unfiled = UNFILED;
  protected readonly entries = computed<BinderEntry[]>(() =>
    (this.binders() ?? []).map((binder) => ({
      binder,
      status: binderVisibilityStatus(binder, { ownerVisible: this.ownerVisible() }),
    })),
  );
}
