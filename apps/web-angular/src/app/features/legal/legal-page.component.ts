import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LegalDraftBannerComponent } from './legal-draft-banner.component';
import { LegalLanguageSwitchComponent } from './legal-language-switch.component';
import { LegalLanguageService, isLegalLanguage } from './legal-language.service';

/**
 * Renders one legal document from the content map in the active legal language (EN/FR switch,
 * French by default for a French browser); `key` comes from route data, `?lang=en|fr` selects
 * and remembers a language (deep links from emails or the mobile app).
 */
@Component({
  selector: 'app-legal-page',
  imports: [
    RouterLink,
    PageHeaderComponent,
    ErrorStateComponent,
    LegalDraftBannerComponent,
    LegalLanguageSwitchComponent,
  ],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPageComponent {
  private readonly router = inject(Router);
  protected readonly language = inject(LegalLanguageService);

  readonly key = input.required<string>();
  /** `?lang=fr` (query parameter, bound by the router). */
  readonly lang = input<string | undefined>();

  protected readonly document = computed(() => this.language.documentFor(this.key()));
  protected readonly labels = this.language.labels;
  protected readonly effectiveDate = computed(
    () => this.document()?.effectiveDate ?? this.language.effectiveDatePlaceholder(),
  );
  protected readonly otherDocuments = computed(() =>
    this.language.documentList().filter((doc) => doc.key !== this.key()),
  );

  constructor() {
    effect(() => {
      const requested = this.lang();
      untracked(() => {
        if (isLegalLanguage(requested) && requested !== this.language.language()) {
          this.language.set(requested);
        }
      });
    });
  }

  protected openIndex(): void {
    void this.router.navigate(['/legal']);
  }
}
