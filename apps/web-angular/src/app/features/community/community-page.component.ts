import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-community-page',
  imports: [PageHeaderComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <app-page-header
        title="Community"
        subtitle="Public channels by game, region, looking-for, new listings and trades."
      />
      <app-empty-state
        icon="forum"
        title="Channels open in Phase 5"
        description="Community chat with moderation and reporting is part of the messaging milestone."
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityPageComponent {}
