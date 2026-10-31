import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { LegalDraftBannerComponent } from '../../legal/legal-draft-banner.component';
import { LegalLanguageSwitchComponent } from '../../legal/legal-language-switch.component';
import { LegalLanguageService } from '../../legal/legal-language.service';
import { LegalTextsService } from '../../legal/legal-texts.service';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';

/**
 * Settings › Legal (spec 13, board W25): the language switch and the "Draft." banner as they are
 * today (owner, 2026-10-20: the existing French texts and their switch stay; nothing French is
 * added), the documents (Payment Protection and Refund & Dispute hidden while `protectedPayments`
 * is off, decision 23) and Trading safely; each document reads on its own page in a 680 column.
 */
@Component({
  selector: 'app-legal-settings',
  imports: [
    RouterLink,
    LegalDraftBannerComponent,
    LegalLanguageSwitchComponent,
    SectionCardComponent,
    ShellIconComponent,
  ],
  template: `
    <app-section-card
      heading="Legal"
      headingId="legal-heading"
      description="The documents that apply to your account, and how to trade safely."
    >
      <div class="lg__bar">
        <app-legal-draft-banner class="lg__banner" />
        <app-legal-language-switch />
      </div>
      <ul class="lg__list" aria-labelledby="legal-heading" [attr.lang]="language.language()">
        @for (doc of texts.visibleDocuments(); track doc.key) {
          <li>
            <a class="lg__row" [routerLink]="['/legal', doc.key]" data-testid="settings-legal-doc">
              <app-shell-icon name="fileText" [size]="20" />
              <span class="lg__text">
                <span class="lg__title">{{ doc.title }}</span>
                <span class="lg__summary">{{ doc.summary }}</span>
              </span>
              <app-shell-icon class="lg__chevron" name="chevronRight" [size]="18" />
            </a>
          </li>
        }
      </ul>
      <a class="lg__all" routerLink="/legal" fragment="card-data-credits">Card data credits</a>
    </app-section-card>
  `,
  styleUrl: '../settings-section.scss',
  styles: `
    .lg__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    .lg__banner {
      flex: 1 1 260px;
    }
    .lg__list {
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      list-style: none;
    }
    .lg__list li + li {
      border-top: 1px solid var(--color-border);
    }
    .lg__row {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 56px;
      padding: 10px 16px;
      color: var(--color-ink);
      text-decoration: none;
    }
    .lg__row:hover {
      background: var(--color-surface-variant);
    }
    .lg__text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .lg__title {
      font-weight: var(--font-weight-semibold);
    }
    .lg__summary {
      color: var(--color-text-secondary);
      font-size: 13px;
    }
    .lg__chevron {
      color: var(--color-text-muted);
    }
    .lg__all {
      display: inline-block;
      margin-top: 16px;
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalSettingsComponent {
  protected readonly language = inject(LegalLanguageService);
  protected readonly texts = inject(LegalTextsService);
}
