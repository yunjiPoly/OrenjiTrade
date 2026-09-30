import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  numberAttribute,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import type { BinderResponse } from '@orenji/api-client';
import {
  INVENTORY_AVAILABILITIES,
  TEMPORARY_DURATIONS,
  VISIBILITY_INFO,
} from '../../../shared/inventory/inventory-labels';
import { AVAILABILITIES } from '../../../shared/ui/availability-chip/availability';
import { BulkAction } from '../data/bulk-actions';

/**
 * Actions on the selected cards: visibility (including a temporary publication with its
 * duration), move to a binder, availability, confirm and delete. The page shows the outcome.
 */
@Component({
  selector: 'app-bulk-bar',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule, MatMenuModule],
  template: `
    <div class="bb" role="toolbar" aria-label="Bulk actions" [attr.aria-busy]="busy()">
      <mat-checkbox
        class="bb__all"
        [checked]="allSelected()"
        [indeterminate]="!allSelected()"
        aria-label="Select all cards on this page"
        (change)="toggleAll.emit()"
      />
      <span class="bb__count" aria-live="polite">{{ count() }} selected</span>

      <div class="bb__actions">
        <button matButton type="button" [matMenuTriggerFor]="visibilityMenu" [disabled]="busy()">
          <mat-icon aria-hidden="true">visibility</mat-icon>
          Visibility
        </button>
        <button matButton type="button" [matMenuTriggerFor]="binderMenu" [disabled]="busy()">
          <mat-icon aria-hidden="true">drive_file_move</mat-icon>
          Move to binder
        </button>
        <button matButton type="button" [matMenuTriggerFor]="availabilityMenu" [disabled]="busy()">
          <mat-icon aria-hidden="true">swap_horiz</mat-icon>
          Availability
        </button>
        <button
          matButton
          type="button"
          [disabled]="busy()"
          (click)="action.emit({ kind: 'confirm' })"
        >
          <mat-icon aria-hidden="true">task_alt</mat-icon>
          Confirm
        </button>
        <button
          matButton
          type="button"
          class="bb__danger"
          [disabled]="busy()"
          (click)="action.emit({ kind: 'delete' })"
        >
          <mat-icon aria-hidden="true">delete</mat-icon>
          Delete
        </button>
      </div>
      <button matIconButton type="button" aria-label="Clear selection" (click)="clear.emit()">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-menu #visibilityMenu="matMenu">
      <button mat-menu-item type="button" (click)="setVisibility('PRIVATE')">
        <mat-icon aria-hidden="true">{{ visibility.PRIVATE.icon }}</mat-icon>
        Make private
      </button>
      <button mat-menu-item type="button" (click)="setVisibility('PUBLIC')">
        <mat-icon aria-hidden="true">{{ visibility.PUBLIC.icon }}</mat-icon>
        Make public
      </button>
      <button mat-menu-item type="button" [matMenuTriggerFor]="durationMenu">
        <mat-icon aria-hidden="true">{{ visibility.TEMPORARILY_PUBLIC.icon }}</mat-icon>
        Temporarily public
      </button>
    </mat-menu>
    <mat-menu #durationMenu="matMenu">
      @for (duration of durations; track duration.value) {
        <button
          mat-menu-item
          type="button"
          (click)="
            action.emit({
              kind: 'visibility',
              visibility: 'TEMPORARILY_PUBLIC',
              duration: duration.value,
            })
          "
        >
          Public for {{ duration.label }}
        </button>
      }
    </mat-menu>
    <mat-menu #binderMenu="matMenu">
      <button
        mat-menu-item
        type="button"
        (click)="action.emit({ kind: 'move', binderId: null, binderName: null })"
      >
        <mat-icon aria-hidden="true">inbox</mat-icon>
        No binder (unfiled)
      </button>
      @for (binder of binders(); track binder.id) {
        <button
          mat-menu-item
          type="button"
          (click)="action.emit({ kind: 'move', binderId: binder.id, binderName: binder.name })"
        >
          <mat-icon aria-hidden="true">menu_book</mat-icon>
          {{ binder.name }}
        </button>
      }
    </mat-menu>
    <mat-menu #availabilityMenu="matMenu">
      @for (value of availabilities; track value) {
        <button
          mat-menu-item
          type="button"
          (click)="action.emit({ kind: 'availability', availability: value })"
        >
          <mat-icon aria-hidden="true">{{ availabilityInfo[value].icon }}</mat-icon>
          {{ availabilityInfo[value].label }}
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: block;
    }
    .bb {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1) var(--spacing-2);
      padding: var(--spacing-1) var(--spacing-2);
      border-radius: var(--radius-lg);
      background: var(--color-ink);
      color: var(--color-background);
      box-shadow: var(--elevation-floating);
      --mat-button-text-label-text-color: var(--color-background);
      --mat-icon-button-icon-color: var(--color-background);
      --mat-checkbox-unselected-icon-color: var(--color-background);
      animation: bb-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .bb__count {
      font-weight: var(--font-weight-semibold);
      margin-right: var(--spacing-2);
    }
    .bb__actions {
      display: flex;
      flex: 1 1 auto;
      flex-wrap: wrap;
      gap: 2px;
    }
    .bb__danger {
      --mat-button-text-label-text-color: #fca5a5;
    }
    @keyframes bb-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkBarComponent {
  readonly count = input.required({ transform: numberAttribute });
  readonly binders = input<readonly BinderResponse[]>([]);
  readonly allSelected = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly action = output<BulkAction>();
  readonly toggleAll = output<void>();
  readonly clear = output<void>();

  protected readonly visibility = VISIBILITY_INFO;
  protected readonly durations = TEMPORARY_DURATIONS;
  protected readonly availabilities = INVENTORY_AVAILABILITIES;
  protected readonly availabilityInfo = AVAILABILITIES;

  protected setVisibility(visibility: 'PRIVATE' | 'PUBLIC'): void {
    this.action.emit({ kind: 'visibility', visibility });
  }
}
