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
import {
  FormArray,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { authErrorCode, authErrorMessage, isPopupDismissed } from '../../../core/auth/auth-errors';
import { safeReturnUrl } from '../../../core/auth/auth.guards';
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
import { LegalLanguageService } from '../../legal/legal-language.service';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';
import { LegalDocumentsStore } from '../data/legal-documents.store';
import { GoogleButtonComponent } from '../google-button/google-button.component';
import {
  ConsentItem,
  LegalConsentListComponent,
} from '../legal-consent-list/legal-consent-list.component';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * `/auth/sign-up`: email + password (or Google), acceptance of every legal document required at
 * registration plus the 18+ confirmation (both recorded with `POST /me/consents`), then a
 * verification email. Google sign-ups collect the same consents on the consent page.
 */
@Component({
  selector: 'app-sign-up-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    AuthLayoutComponent,
    GoogleButtonComponent,
    LegalConsentListComponent,
    AgeConfirmationCheckboxComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './sign-up-page.component.html',
  styleUrl: '../auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUpPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  protected readonly auth = inject(AuthService);
  protected readonly legal = inject(LegalDocumentsStore);
  private readonly legalLanguage = inject(LegalLanguageService);

  readonly returnUrl = input<string | undefined>();

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  protected readonly consents = new FormArray<FormControl<boolean>>([]);
  /** Unticked by default; the server records the confirmation (`AGE_CONFIRMATION`). */
  protected readonly ageConfirmed = this.fb.control(false, {
    validators: Validators.requiredTrue,
  });
  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
    ageConfirmed: this.ageConfirmed,
  });
  /** Titles follow the active legal language (the linked pages open in that language). */
  protected readonly consentItems = computed<ConsentItem[]>(() =>
    this.legal.requiredAtRegistration().map((doc) => ({
      documentType: doc.documentType,
      title: this.legalLanguage.titleOf(doc.url, doc.title),
      url: doc.url,
    })),
  );
  protected readonly submitting = signal(false);
  protected readonly googleBusy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hidePassword = signal(true);
  protected readonly step = signal<'idle' | 'account' | 'consents' | 'verification'>('idle');

  constructor() {
    void this.legal.load();
    effect(() => {
      const count = this.consentItems().length;
      untracked(() => this.syncConsentControls(count));
    });
  }

  protected retryLegal(): void {
    void this.legal.load(true);
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid || this.consents.invalid || this.consentItems().length === 0) {
      this.form.markAllAsTouched();
      this.consents.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    try {
      const current = this.auth.user();
      if (!current || current.email?.toLowerCase() !== email.trim().toLowerCase()) {
        this.step.set('account');
        await this.auth.signUpWithEmail(email, password);
      }
      this.step.set('consents');
      await this.session.acceptConsents(this.requiredConsents());
      this.step.set('verification');
      await this.auth.sendEmailVerification().catch((error: unknown) => {
        console.warn('[OrenjiTrade] Verification email not sent.', error);
      });
      await this.router.navigate(['/auth/verify-email'], {
        queryParams: { returnUrl: safeReturnUrl(this.returnUrl()) },
      });
    } catch (error) {
      this.error.set(isApiError(error) ? friendlyMessage(error) : authErrorMessage(error));
    } finally {
      this.submitting.set(false);
      this.step.set('idle');
    }
  }

  /** Google sign-up: the consent page collects the legal acceptance afterwards. */
  protected async google(): Promise<void> {
    this.error.set(null);
    this.googleBusy.set(true);
    try {
      await this.auth.signInWithGoogle();
      await routeAfterSignIn(this.session, this.router, this.returnUrl());
    } catch (error) {
      if (!isPopupDismissed(error) || authErrorCode(error) === 'auth/popup-blocked') {
        this.error.set(authErrorMessage(error));
      }
    } finally {
      this.googleBusy.set(false);
    }
  }

  /** Every consent to record at sign-up: the required documents and the 18+ confirmation. */
  private requiredConsents() {
    const consents = this.legal
      .requiredAtRegistration()
      .map((doc) => ({ documentType: doc.documentType as string, version: doc.version }));
    const age = this.legal.ageConfirmation();
    if (age) {
      consents.push({ documentType: AGE_CONFIRMATION_TYPE, version: age.version });
    }
    return consents;
  }

  private syncConsentControls(count: number): void {
    while (this.consents.length < count) {
      this.consents.push(this.fb.control(false, { validators: Validators.requiredTrue }));
    }
    while (this.consents.length > count) {
      this.consents.removeAt(this.consents.length - 1);
    }
  }
}
