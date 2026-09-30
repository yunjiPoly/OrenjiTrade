import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { AdminFlagsComponent } from '../community/admin-flags.component';
import { ModerationRulesComponent } from './moderation-rules.component';

const TABS = ['rules', 'flags'] as const;

/**
 * `/admin/moderation` (moderators and admins): the automatic moderation rules and the queue of
 * flags they raised (community content, messages and the report threshold). The open tab lives
 * in the URL (`?tab=flags`).
 */
@Component({
  selector: 'app-admin-moderation-page',
  imports: [MatTabsModule, PageHeaderComponent, AdminFlagsComponent, ModerationRulesComponent],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Moderation"
        subtitle="Rules that block or flag content automatically, and the flags waiting for a moderator. Flags never ban anyone by themselves."
      />
      <mat-tab-group
        mat-stretch-tabs="false"
        [selectedIndex]="selectedIndex()"
        (selectedIndexChange)="onTab($event)"
      >
        <mat-tab label="Rules">
          <div class="tab">
            <app-moderation-rules />
          </div>
        </mat-tab>
        <mat-tab label="Flags queue">
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
export class AdminModerationPageComponent {
  private readonly router = inject(Router);

  /** `?tab=` query parameter. */
  readonly tab = input<string | undefined>();

  protected readonly selectedIndex = computed(() =>
    Math.max(0, TABS.indexOf((this.tab() ?? 'rules') as (typeof TABS)[number])),
  );

  protected onTab(index: number): void {
    void this.router.navigate([], {
      queryParams: { tab: index === 0 ? null : TABS[index] },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
