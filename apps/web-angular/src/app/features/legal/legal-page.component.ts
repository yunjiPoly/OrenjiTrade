import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_LIST,
  LEGAL_EFFECTIVE_DATE_PLACEHOLDER,
  isLegalKey,
} from './legal-content';
import { LegalDraftBannerComponent } from './legal-draft-banner.component';

/** Renders one legal document from the content map; `key` comes from route data. */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, PageHeaderComponent, ErrorStateComponent, LegalDraftBannerComponent],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPageComponent {
  private readonly router = inject(Router);

  readonly key = input.required<string>();

  protected readonly document = computed(() => {
    const key = this.key();
    return isLegalKey(key) ? LEGAL_DOCUMENTS[key] : null;
  });
  protected readonly effectiveDate = computed(
    () => this.document()?.effectiveDate ?? LEGAL_EFFECTIVE_DATE_PLACEHOLDER,
  );
  protected readonly otherDocuments = computed(() =>
    LEGAL_DOCUMENT_LIST.filter((doc) => doc.key !== this.key()),
  );

  protected openIndex(): void {
    void this.router.navigate(['/legal']);
  }
}
