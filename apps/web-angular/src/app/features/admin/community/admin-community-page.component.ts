import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { AdminChannelsComponent } from './admin-channels.component';
import { AdminFlagsComponent } from './admin-flags.component';

const TABS = ['channels', 'flags'] as const;

/**
 * `/admin/community` (moderators and admins): the community channels and the automatic
 * moderation flags. Post and reply removal happens in place on `/community` from the post menu.
 * The open tab lives in the URL (`?tab=flags`).
 */
@Component({
  selector: 'app-admin-community-page',
  imports: [MatTabsModule, PageHeaderComponent, AdminChannelsComponent, AdminFlagsComponent],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Community"
        subtitle="Channels members post in, and the flags raised by the automatic moderation rules. Remove posts or replies from their menu on the community page."
      />
      <mat-tab-group
        mat-stretch-tabs="false"
        [selectedIndex]="selectedIndex()"
        (selectedIndexChange)="onTab($event)"
      >
        <mat-tab label="Channels">
          <div class="tab">
            <app-admin-channels />
          </div>
        </mat-tab>
        <mat-tab label="Moderation flags">
          <ng-template matTabContent>
            <div class="tab">
              <app-admin-flags />
            </div>
          </ng-template>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .tab {
      padding-top: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCommunityPageComponent {
  private readonly router = inject(Router);

  /** `?tab=` query parameter (withComponentInputBinding). */
  readonly tab = input<string | undefined>();

  protected readonly selectedIndex = computed(() =>
    Math.max(0, TABS.indexOf((this.tab() ?? 'channels') as (typeof TABS)[number])),
  );

  protected onTab(index: number): void {
    void this.router.navigate([], {
      queryParams: { tab: index === 0 ? null : TABS[index] },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
