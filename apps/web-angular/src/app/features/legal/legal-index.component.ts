import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
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
        @for (doc of texts.documentList(); track doc.key) {
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
}
