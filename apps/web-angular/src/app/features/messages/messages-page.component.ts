import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-messages-page',
  imports: [PageHeaderComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Messages" subtitle="Private conversations with other collectors." />
      <app-empty-state
        icon="chat"
        title="No conversations yet"
        description="Private messaging with realtime delivery arrives in Phase 5."
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPageComponent {}
