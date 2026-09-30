import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CardSearchBoxComponent } from '../../../shared/catalog/card-search-box/card-search-box.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field/search-field.component';
import { WordmarkComponent } from '../../../shared/ui/wordmark/wordmark.component';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AccountMenuComponent } from '../account-menu/account-menu.component';
import { PRIMARY_NAV_LINKS } from '../nav-links';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

/**
 * Top toolbar: wordmark, primary navigation (links of switched-off features are hidden), card
 * search with autocomplete, the notification bell (Phase 6), theme, account.
 */
@Component({
  selector: 'app-top-bar',
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    RouterLinkActive,
    WordmarkComponent,
    SearchFieldComponent,
    CardSearchBoxComponent,
    ThemeToggleComponent,
    AccountMenuComponent,
    NotificationBellComponent,
  ],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  private readonly flags = inject(FeatureFlagsService);
  protected readonly navLinks = computed(() =>
    PRIMARY_NAV_LINKS.filter((link) => !link.feature || this.flags.isEnabled(link.feature)),
  );
  readonly querySubmit = output<string>();
}
