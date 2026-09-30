import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { FooterComponent } from '../footer/footer.component';
import { SessionBannerComponent } from '../session-banner/session-banner.component';
import { TopBarComponent } from '../top-bar/top-bar.component';

/**
 * Application frame: skip link, top bar, session banner (account could not load), routed main
 * content, footer and the mobile bottom navigation. Feature pages render inside `<main>`.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    TopBarComponent,
    SessionBannerComponent,
    FooterComponent,
    BottomNavComponent,
  ],
  template: `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <app-top-bar (querySubmit)="onSearch($event)" />
    <app-session-banner />
    <main id="main-content" class="shell__main" tabindex="-1">
      <router-outlet />
    </main>
    <app-footer class="shell__footer" />
    <app-bottom-nav />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }
    .shell__main {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      outline: none;
    }
    .shell__main > :not(router-outlet) {
      flex: 1 1 auto;
      min-height: 0;
    }
    @media (max-width: 959px) {
      .shell__footer {
        padding-bottom: calc(64px + env(safe-area-inset-bottom));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  private readonly router = inject(Router);

  protected onSearch(query: string): void {
    void this.router.navigate(['/cards'], { queryParams: { q: query } });
  }
}
