import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WordmarkComponent } from '../../../shared/ui/wordmark/wordmark.component';

/**
 * The footer of reading pages (spec 4.10): 48 tall, 13 muted, the wordmark, "Who in my region has
 * this card?" and "Trading safely · Legal · Card data credits · Made with Natural Earth". Split and
 * workspace pages (Search, Inventory, Import, Messages, Home) have none.
 */
@Component({
  selector: 'app-footer',
  imports: [RouterLink, WordmarkComponent],
  template: `
    <footer class="footer">
      <div class="footer__brand">
        <app-wordmark link="false" size="sm" />
        <span class="footer__tagline">Who in my region has this card?</span>
      </div>
      <nav class="footer__links" aria-label="Legal">
        <a routerLink="/legal/trading-safely">Trading safely</a>
        <span aria-hidden="true">·</span>
        <a routerLink="/legal">Legal</a>
        <span aria-hidden="true">·</span>
        <a routerLink="/legal" fragment="card-data-credits">Card data credits</a>
        <span aria-hidden="true">·</span>
        <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer"
          >Made with Natural Earth</a
        >
      </nav>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2) var(--spacing-6);
      min-height: 48px;
      padding: var(--spacing-3) var(--spacing-8);
      border-top: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .footer__brand {
      display: flex;
      align-items: baseline;
      gap: var(--spacing-3);
    }
    .footer__links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1) var(--spacing-2);
    }
    .footer__links a {
      color: inherit;
      text-decoration: none;
    }
    .footer__links a:hover {
      color: var(--color-accent);
      text-decoration: underline;
    }
    @media (max-width: 599.98px) {
      .footer {
        padding: var(--spacing-3) var(--spacing-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {}
