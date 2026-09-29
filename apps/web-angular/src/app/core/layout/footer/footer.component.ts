import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LEGAL_DOCUMENT_LIST } from '../../../features/legal/legal-content';
import { WordmarkComponent } from '../../../shared/ui/wordmark/wordmark.component';
import { ApiVersionComponent } from '../api-version/api-version.component';

@Component({
  selector: 'app-footer',
  imports: [RouterLink, WordmarkComponent, ApiVersionComponent],
  template: `
    <footer class="footer">
      <div class="footer__inner">
        <div class="footer__brand">
          <app-wordmark link="false" size="sm" />
          <p class="footer__tagline">Who near me has this card?</p>
        </div>
        <nav class="footer__legal" aria-label="Legal">
          <a routerLink="/legal">Legal</a>
          @for (doc of legalDocuments; track doc.key) {
            <a [routerLink]="['/legal', doc.key]">{{ doc.shortTitle }}</a>
          }
        </nav>
        <div class="footer__meta">
          <span>(c) 2026 OrenjiTrade</span>
          <app-api-version />
        </div>
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
    .footer__legal a {
      color: inherit;
      text-decoration: none;
    }
    .footer__legal a:hover {
      color: var(--color-accent);
      text-decoration: underline;
    }
    .footer__meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  protected readonly legalDocuments = LEGAL_DOCUMENT_LIST;
}
