import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { CardDataAttributionComponent } from '../../shared/catalog/card-data-attribution/card-data-attribution.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LegalDraftBannerComponent } from './legal-draft-banner.component';
import { LegalLanguageSwitchComponent } from './legal-language-switch.component';
import { LegalLanguageService } from './legal-language.service';
import { LegalTextsService } from './legal-texts.service';

@Component({
  selector: 'app-legal-index',
  imports: [
    RouterLink,
    MatIconModule,
    PageHeaderComponent,
    LegalDraftBannerComponent,
    LegalLanguageSwitchComponent,
    CardDataAttributionComponent,
  ],
  template: `
    <div class="page" [attr.lang]="language.language()">
      <div class="legal-index__bar">
        <app-legal-draft-banner class="legal-index__banner" />
        <app-legal-language-switch />
      </div>
      <app-page-header
        [title]="language.labels().indexTitle"
        [subtitle]="language.labels().indexSubtitle"
      />
      <ul class="legal-index">
        @for (doc of documents(); track doc.key) {
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
      <section
        class="legal-index__credits"
        id="card-data-credits"
        aria-labelledby="card-data-title"
      >
        <h2 class="legal-index__credits-title" id="card-data-title">Card data credits</h2>
        <app-card-data-attribution />
        <p class="legal-index__credits-text">
          Maps are made with Natural Earth: free vector and raster map data at
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer"
            >naturalearthdata.com</a
          >.
        </p>
      </section>
    </div>
  `,
  styles: `
    .legal-index__bar {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-6);
    }
    .legal-index__banner {
      flex: 1 1 auto;
      margin-bottom: 0;
    }
    .legal-index {
      display: grid;
      /* min(): one column that shrinks below 352 px windows (WCAG 1.4.10 at 320). */
      grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
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
      min-width: 0;
      overflow-wrap: anywhere;
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
    .legal-index__credits {
      margin-top: var(--spacing-10);
      max-width: 68ch;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .legal-index__credits-title {
      margin-bottom: var(--spacing-3);
      color: var(--color-ink);
      font-size: var(--font-size-section);
    }
    .legal-index__credits-text {
      margin: var(--spacing-3) 0 0;
    }
    @media (max-width: 599px) {
      .legal-index__bar {
        flex-direction: column-reverse;
        align-items: flex-end;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalIndexComponent {
  protected readonly language = inject(LegalLanguageService);
  protected readonly texts = inject(LegalTextsService);
  /** Payment Protection and Refund & Dispute only while protectedPayments is on (decision 23). */
  protected readonly documents = this.texts.visibleDocuments;
}
