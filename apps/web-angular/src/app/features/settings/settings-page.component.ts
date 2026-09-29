import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AppConfigService } from '../../core/config/app-config.service';
import { ThemeService } from '../../core/theme/theme.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-settings-page',
  imports: [MatButtonModule, MatIconModule, PageHeaderComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Settings" subtitle="Account, privacy, notifications and appearance.">
        <button actions matButton="filled" type="button" disabled>
          <mat-icon aria-hidden="true">login</mat-icon>
          Sign in
        </button>
      </app-page-header>

      <section class="settings__section" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance">Appearance</h2>
        <p>
          Theme: <strong>{{ theme.preference() }}</strong> (currently {{ theme.resolved() }}).
          Use the theme button in the toolbar to change it; the choice is stored on this device.
        </p>
      </section>

      <section class="settings__section" aria-labelledby="settings-environment">
        <h2 id="settings-environment">Environment</h2>
        <p>
          Connected to <span class="mono">{{ config.apiBaseUrl() || 'same origin' }}</span> ·
          environment <span class="mono">{{ config.environment() }}</span>
        </p>
      </section>

      <app-empty-state
        icon="manage_accounts"
        title="Sign in to manage your account"
        description="Registration, profile, privacy settings and trading area selection arrive in Phase 1."
      />
    </div>
  `,
  styles: `
    .settings__section {
      margin-bottom: var(--spacing-6);
    }
    .settings__section h2 {
      font-size: var(--font-size-lg);
      margin-bottom: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly config = inject(AppConfigService);
}
