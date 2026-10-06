import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LegalLanguageService } from './legal-language.service';

/**
 * Prominent notice that legal copy has not yet been reviewed by counsel, in the active legal
 * language; the French pages add that the translation itself awaits the lawyer's validation.
 */
@Component({
  selector: 'app-legal-draft-banner',
  imports: [MatIconModule],
  template: `
    <div class="banner" role="status" [attr.lang]="language.language()">
      <mat-icon aria-hidden="true">gavel</mat-icon>
      <div class="banner__body">
        <p class="banner__text">{{ language.draftBanner() }}</p>
        @if (language.translationNotice(); as notice) {
          <p class="banner__notice" data-testid="legal-translation-notice">{{ notice }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--spacing-6);
    }
    .banner {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-status-aging);
      border-left-width: 6px;
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .banner__body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .banner__text {
      margin: 0;
    }
    .banner__notice {
      margin: 0;
      font-weight: var(--font-weight-regular);
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalDraftBannerComponent {
  protected readonly language = inject(LegalLanguageService);
}
