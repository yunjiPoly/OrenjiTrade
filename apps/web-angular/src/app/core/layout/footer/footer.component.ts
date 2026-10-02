import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { LEGAL_DOCUMENT_LIST } from '../../../features/legal/legal-content';
import { CardDataAttributionComponent } from '../../../shared/catalog/card-data-attribution/card-data-attribution.component';
import { WordmarkComponent } from '../../../shared/ui/wordmark/wordmark.component';
import { FEATURE, FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { ApiVersionComponent } from '../api-version/api-version.component';

/** Sign-in, sign-up and the other account steps. */
const ACCOUNT_PAGE = /^\/auth(\/|\?|#|$)/;

@Component({
  selector: 'app-footer',
  imports: [
    RouterLink,
    MatIconModule,
    CardDataAttributionComponent,
    WordmarkComponent,
    ApiVersionComponent,
  ],
  template: `
    <footer class="footer">
      <div class="footer__inner">
        <div class="footer__brand">
          <app-wordmark link="false" size="sm" />
          <p class="footer__tagline">Who near me has this card?</p>
        </div>
        @if (donations() || premiumPlans()) {
          <nav class="footer__links" aria-label="OrenjiTrade">
            @if (donations()) {
              <a routerLink="/support" data-testid="footer-support">
                <mat-icon aria-hidden="true">volunteer_activism</mat-icon>
                Support OrenjiTrade
              </a>
            }
            @if (premiumPlans()) {
              <a routerLink="/premium">Premium</a>
            }
          </nav>
        }
        <nav class="footer__legal" aria-label="Legal">
          <a routerLink="/legal">Legal</a>
          @for (doc of legalDocuments; track doc.key) {
            <a [routerLink]="['/legal', doc.key]">{{ doc.shortTitle }}</a>
          }
        </nav>
        <div class="footer__meta">
          <span>(c) 2026 OrenjiTrade</span>
          <!-- The version probe (chunk and GET /meta) loads once the footer is on screen, and not
               on the account pages, which stay free of background requests. -->
          @if (showVersion()) {
            @defer (on viewport) {
              <app-api-version />
            } @placeholder {
              <span class="footer__version-slot" aria-hidden="true"></span>
            }
          } @else {
            <span class="footer__version-slot" aria-hidden="true"></span>
          }
        </div>
        <app-card-data-attribution class="footer__credits" />
      </div>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }
    .footer {
      border-top: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .footer__inner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3) var(--spacing-6);
      max-width: 1440px;
      margin: 0 auto;
      padding: var(--spacing-4);
    }
    .footer__brand {
      display: flex;
      align-items: baseline;
      gap: var(--spacing-3);
    }
    .footer__tagline {
      margin: 0;
    }
    .footer__legal {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2) var(--spacing-4);
    }
    .footer__links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2) var(--spacing-4);
    }
    .footer__links a {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }
    .footer__links mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--color-accent);
    }
    .footer__legal a {
      color: inherit;
      text-decoration: none;
    }
    .footer__links a:hover,
    .footer__legal a:hover {
      color: var(--color-accent);
      text-decoration: underline;
    }
    .footer__meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
    }
    .footer__credits {
      flex: 1 1 100%;
    }
    .footer__version-slot {
      display: inline-block;
      min-width: 9rem;
      min-height: 24px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  private readonly router = inject(Router);
  private readonly flags = inject(FeatureFlagsService);
  protected readonly legalDocuments = LEGAL_DOCUMENT_LIST;
  /** "Support OrenjiTrade" (voluntary donations) while the `donations` flag is on. */
  protected readonly donations = this.flags.enabled(FEATURE.donations);
  protected readonly premiumPlans = this.flags.enabled(FEATURE.premiumPlans);
  /** False until a navigation settled (the first page may be an account page) and on them. */
  protected readonly showVersion = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => !ACCOUNT_PAGE.test(event.urlAfterRedirects)),
    ),
    { initialValue: this.router.navigated && !ACCOUNT_PAGE.test(this.router.url) },
  );
}
