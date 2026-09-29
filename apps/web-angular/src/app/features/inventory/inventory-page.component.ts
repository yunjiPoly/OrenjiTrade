import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

export type InventoryVisibility = 'PRIVATE' | 'PUBLIC' | 'TEMPORARILY_PUBLIC';

interface VisibilityOption {
  value: InventoryVisibility;
  label: string;
  icon: string;
  hint: string;
}

const VISIBILITY_OPTIONS: readonly VisibilityOption[] = [
  {
    value: 'PRIVATE',
    label: 'Private',
    icon: 'lock',
    hint: 'Only you can see private cards. New cards start here.',
  },
  {
    value: 'PUBLIC',
    label: 'Public',
    icon: 'public',
    hint: 'Public cards appear on the map and in search for collectors near you.',
  },
  {
    value: 'TEMPORARILY_PUBLIC',
    label: 'Temporarily public',
    icon: 'timer',
    hint: 'Visible until a date you choose, then private again automatically.',
  },
];

@Component({
  selector: 'app-inventory-page',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="page">
      <app-page-header title="Inventory" subtitle="Your binders and cards. Private by default.">
        <button actions matButton="filled" type="button" disabled>
          <mat-icon aria-hidden="true">add</mat-icon>
          Add card
        </button>

        <mat-button-toggle-group
          name="visibility"
          aria-label="Inventory visibility"
          class="inventory__visibility"
          hideSingleSelectionIndicator
          [value]="visibility()"
          (change)="onVisibilityChange($event)"
        >
          @for (option of options; track option.value) {
            <mat-button-toggle [value]="option.value">
              <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
              {{ option.label }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
      </app-page-header>

      <app-empty-state icon="style" title="No cards yet" [description]="hint()" />
    </div>
  `,
  styles: `
    .inventory__visibility mat-icon {
      margin-right: var(--spacing-1);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryPageComponent {
  protected readonly options = VISIBILITY_OPTIONS;
  protected readonly visibility = signal<InventoryVisibility>('PRIVATE');
  protected readonly hint = computed(
    () =>
      `${VISIBILITY_OPTIONS.find((o) => o.value === this.visibility())?.hint ?? ''} Adding cards arrives in Phase 3.`,
  );

  protected onVisibilityChange(event: MatButtonToggleChange): void {
    this.visibility.set(event.value as InventoryVisibility);
  }
}
