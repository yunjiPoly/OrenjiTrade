import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LEGAL_DOCUMENT_LIST } from './legal-content';
import { LegalDraftBannerComponent } from './legal-draft-banner.component';

@Component({
  selector: 'app-legal-index',
  imports: [RouterLink, MatIconModule, PageHeaderComponent, LegalDraftBannerComponent],
  template: `
    <div class="page">
      <app-legal-draft-banner />
      <app-page-header
        title="Legal"
        subtitle="The policies that govern OrenjiTrade. Each page lists its effective date and version."
      />
      <ul class="legal-index">
        @for (doc of documents; track doc.key) {
          <li>
            <a class="legal-index__card" [routerLink]="['/legal', doc.key]">
              <mat-icon aria-hidden="true">description</mat-icon>
              <span class="legal-index__body">
                <span class="legal-index__title">{{ doc.title }}</span>
                <span class="legal-index__summary">{{ doc.summary }}</span>
              </span>
              <mat-icon class="legal-index__chevron" aria-hidden="true">chevron_right</mat-icon>
            </a>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .legal-index {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--spacing-3);
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .legal-index__card {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      height: 100%;
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      color: inherit;
      text-decoration: none;
      transition: border-color var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .legal-index__card:hover {
      border-color: var(--color-primary);
    }
    .legal-index__body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .legal-index__title {
      font-family: var(--font-display);
      font-weight: var(--font-weight-semibold);
    }
    .legal-index__summary {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .legal-index__chevron {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalIndexComponent {
  protected readonly documents = LEGAL_DOCUMENT_LIST;
}
