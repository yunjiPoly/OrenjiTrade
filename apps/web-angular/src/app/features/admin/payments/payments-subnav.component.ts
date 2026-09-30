import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Sub-navigation of the Payments section (payments, provider webhook events, payment rules); the
 * page's content is projected into the tab panel.
 */
@Component({
  selector: 'app-payments-subnav',
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatTabsModule],
  template: `
    <nav
      mat-tab-nav-bar
      mat-stretch-tabs="false"
      mat-align-tabs="start"
      [tabPanel]="panel"
      aria-label="Payments views"
      class="subnav"
    >
      @for (link of links; track link.path) {
        <a
          mat-tab-link
          [routerLink]="link.path"
          routerLinkActive
          #active="routerLinkActive"
          [routerLinkActiveOptions]="activeOptions"
          [active]="active.isActive"
        >
          <mat-icon aria-hidden="true">{{ link.icon }}</mat-icon>
          {{ link.label }}
        </a>
      }
    </nav>
    <mat-tab-nav-panel #panel><ng-content /></mat-tab-nav-panel>
  `,
  styles: `
    .subnav {
      margin-bottom: var(--spacing-4);
    }
    .subnav mat-icon {
      width: 18px;
      height: 18px;
      margin-right: var(--spacing-1);
      font-size: 18px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsSubnavComponent {
  protected readonly activeOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };
  protected readonly links = [
    { path: '/admin/payments', label: 'Payments', icon: 'payments' },
    { path: '/admin/payments/webhooks', label: 'Webhook events', icon: 'webhook' },
    { path: '/admin/payments/settings', label: 'Settings', icon: 'tune' },
  ];
}
