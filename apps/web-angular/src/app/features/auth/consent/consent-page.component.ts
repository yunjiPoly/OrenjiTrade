import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormArray, FormControl, NonNullableFormBuilder, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { isApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import {
  AGE_CONFIRMATION_TYPE,
  AgeConfirmationCheckboxComponent,
} from '../../../shared/legal/age-confirmation-checkbox.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { LegalTextsService } from '../../legal/legal-texts.service';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';
import { LegalDocumentsStore } from '../data/legal-documents.store';
import {
  ConsentItem,
  LegalConsentListComponent,
} from '../legal-consent-list/legal-consent-list.component';

/**
 * `/auth/consent`: shown when the API answers 428 `TERMS_ACCEPTANCE_REQUIRED` (new documents,
 * new versions, or a Google sign-up). Records each acceptance, plus the 18+ confirmation when the
 * account has none yet (Google sign-ups never saw the sign-up checkbox), then continues.
 */
@Component({
  selector: 'app-consent-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AuthLayoutComponent,
    LegalConsentListComponent,
    AgeConfirmationCheckboxComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <app-auth-layout
      heading="Review our terms"
      subheading="Please accept the current versions of these documents to keep using OrenjiTrade."
    >
      @if (error(); as message) {
        <div class="form__alert" role="alert">
          <mat-icon aria-hidden="true">error</mat-icon>
          <p>{{ message }}</p>
        </div>
      }

      @if (loading()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading</span>
          <app-skeleton variant="list" lines="3" />
        </div>
      } @else if (session.status() === 'error' && session.error(); as sessionError) {
        <app-error-state
          title="We could not load your account"
          [message]="sessionError.message"
          (retry)="reload()"
        />
      } @else if (items().length === 0) {
        <div class="form__alert form__alert--success" role="status">
          <mat-icon aria-hidden="true">task_alt</mat-icon>
          <p>You have accepted every current document.</p>
        </div>
        <button matButton="filled" type="button" class="form__submit" (click)="continue()">
          Continue
        </button>
      } @else {
        <div class="form">
          <app-legal-consent-list
            [items]="items()"
            [formArray]="consents"
            [showError]="submitted() && consents.invalid"
          />
          @if (ageConfirmationPending()) {
            <app-age-confirmation-checkbox
              [control]="ageConfirmed"
              [showError]="submitted() && ageConfirmed.invalid"
            />
          }
          <button
            matButton="filled"
            type="button"
            class="form__submit"
            [disabled]="saving()"
            (click)="accept()"
          >
            @if (saving()) {
              <mat-spinner class="form__spinner" diameter="18" aria-hidden="true" />
            }
            Accept and continue
          </button>
        </div>
      }
      <p class="form__footer">
        Not now? <button matButton type="button" (click)="signOut()">Sign out</button>
      </p>
    </app-auth-layout>
  `,
  styleUrl: '../auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly legal = inject(LegalDocumentsStore);
  private readonly legalTexts = inject(LegalTextsService);
  protected readonly session = inject(SessionService);

  readonly returnUrl = input<string | undefined>();

  protected readonly consents = new FormArray<FormControl<boolean>>([]);
  protected readonly ageConfirmed = this.fb.control(false, {
    validators: Validators.requiredTrue,
  });
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly items = computed<ConsentItem[]>(() => {
    // Reading the documents keeps titles fresh once they load.
    this.legal.documents();
    return this.session.requiredConsents().map((consent) => {
      const described = this.legal.describe(consent);
      return {
        documentType: consent.documentType,
        url: described.url,
        // Titles follow the active legal language (the linked pages open in that language).
        title: this.legalTexts.titleOf(described.url, described.title),
      };
    });
  });
  /** The account never confirmed being 18+ and the API publishes the attestation to record. */
  protected readonly ageConfirmationPending = computed(
    () => this.session.me()?.onboarding?.ageConfirmed === false && !!this.legal.ageConfirmation(),
  );

  constructor() {
    void this.reload();
    effect(() => {
      const count = this.items().length;
      untracked(() => {
        while (this.consents.length < count) {
          this.consents.push(this.fb.control(false, { validators: Validators.requiredTrue }));
        }
        while (this.consents.length > count) {
          this.consents.removeAt(this.consents.length - 1);
        }
      });
    });
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    await Promise.all([this.session.ensureLoaded(), this.legal.load()]);
    this.loading.set(false);
  }

  protected async accept(): Promise<void> {
    this.submitted.set(true);
    const agePending = this.ageConfirmationPending();
    if (this.consents.invalid || (agePending && this.ageConfirmed.invalid)) {
      this.consents.markAllAsTouched();
      this.ageConfirmed.markAsTouched();
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      const consents = [...this.session.requiredConsents()].map((consent) => ({
        documentType: consent.documentType as string,
        version: consent.version,
      }));
      const age = this.legal.ageConfirmation();
      if (agePending && age) {
        consents.push({ documentType: AGE_CONFIRMATION_TYPE, version: age.version });
      }
      await this.session.acceptConsents(consents);
      await this.continue();
    } catch (error) {
      this.error.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async continue(): Promise<void> {
    await routeAfterSignIn(this.session, this.router, this.returnUrl());
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/map');
  }
}
