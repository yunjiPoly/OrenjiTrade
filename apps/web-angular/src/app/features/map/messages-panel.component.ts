import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

/** Right-hand messages panel on the map page (placeholder until Phase 5). */
@Component({
  selector: 'app-messages-panel',
  imports: [MatButtonModule, MatIconModule, EmptyStateComponent],
  template: `
    <aside class="messages-panel" id="map-messages-panel" aria-labelledby="map-messages-title">
      <header class="messages-panel__header">
        <h2 id="map-messages-title" class="messages-panel__title">Messages</h2>
        <button matIconButton type="button" aria-label="Close messages panel" (click)="close.emit()">
          <mat-icon>close</mat-icon>
        </button>
      </header>
      <app-empty-state
        icon="forum"
        title="No conversations yet"
        description="Private messaging arrives in Phase 5. You will be able to message a collector straight from their map preview."
      />
    </aside>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .messages-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .messages-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-3) var(--spacing-3) var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .messages-panel__title {
      font-size: var(--font-size-lg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPanelComponent {
  readonly close = output<void>();
}
