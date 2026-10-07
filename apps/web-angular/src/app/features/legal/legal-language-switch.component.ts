import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { LegalLanguageService, isLegalLanguage } from './legal-language.service';

/** The EN / FR switch of the legal pages (keyboard: arrow keys move, Space/Enter select). */
@Component({
  selector: 'app-legal-language-switch',
  imports: [MatButtonToggleModule],
  template: `
    <mat-button-toggle-group
      class="switch"
      aria-label="Language / Langue"
      data-testid="legal-language-switch"
      hideSingleSelectionIndicator
      [value]="language.language()"
      (change)="select($event)"
    >
      <mat-button-toggle value="en" lang="en" aria-label="English">EN</mat-button-toggle>
      <mat-button-toggle value="fr" lang="fr" aria-label="Français">FR</mat-button-toggle>
    </mat-button-toggle-group>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .switch {
      --mat-standard-button-toggle-height: 32px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalLanguageSwitchComponent {
  protected readonly language = inject(LegalLanguageService);

  protected select(event: MatButtonToggleChange): void {
    if (isLegalLanguage(event.value)) {
      this.language.set(event.value);
    }
  }
}
