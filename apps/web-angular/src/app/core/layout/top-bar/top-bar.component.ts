import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SearchFieldComponent } from '../../../shared/ui/search-field/search-field.component';
import { WordmarkComponent } from '../../../shared/ui/wordmark/wordmark.component';
import { PRIMARY_NAV_LINKS } from '../nav-links';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

/** Top toolbar: wordmark, primary navigation, global search, notifications, theme, account. */
@Component({
  selector: 'app-top-bar',
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatMenuModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    WordmarkComponent,
    SearchFieldComponent,
    ThemeToggleComponent,
  ],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  protected readonly navLinks = PRIMARY_NAV_LINKS;
  /** Placeholder until the notification centre (Phase 6) provides a real count. */
  protected readonly unreadNotifications = signal(0);
  readonly querySubmit = output<string>();
}
