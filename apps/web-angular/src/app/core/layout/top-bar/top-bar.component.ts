import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CardSearchBoxComponent } from '../../../shared/catalog/card-search-box/card-search-box.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field/search-field.component';
import { WordmarkComponent } from '../../../shared/ui/wordmark/wordmark.component';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AccountMenuComponent } from '../account-menu/account-menu.component';
import { PRIMARY_NAV_LINKS } from '../nav-links';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

/**
 * Top toolbar: wordmark, primary navigation (links of switched-off features are hidden), card
 * search with autocomplete, notifications, theme, account.
 */
@Component({
  selector: 'app-top-bar',
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    WordmarkComponent,
    SearchFieldComponent,
    CardSearchBoxComponent,
    ThemeToggleComponent,
    AccountMenuComponent,
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
  /** Placeholder until the notification centre (Phase 6) provides a real count. */
  protected readonly unreadNotifications = signal(0);
  readonly querySubmit = output<string>();
}
