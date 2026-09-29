import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LEGAL_DRAFT_BANNER } from './legal-content';

/** Prominent notice that legal copy has not yet been reviewed by counsel. */
@Component({
  selector: 'app-legal-draft-banner',
  imports: [MatIconModule],
  template: `
    <div class="banner" role="status">
      <mat-icon aria-hidden="true">gavel</mat-icon>
      <p class="banner__text">{{ text }}</p>
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
    .banner__text {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalDraftBannerComponent {
  protected readonly text = LEGAL_DRAFT_BANNER;
}
