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
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { authErrorCode, authErrorMessage, isPopupDismissed } from '../../../core/auth/auth-errors';
import { safeReturnUrl } from '../../../core/auth/auth.guards';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { isApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
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
import { GoogleButtonComponent } from '../google-button/google-button.component';
import {
  ConsentItem,
  LegalConsentListComponent,
} from '../legal-consent-list/legal-consent-list.component';
import {
  DISPLAY_NAME_MAX,
  SIGN_UP_BLOCKER_LINES,
  displayNameError,
  signUpBlocker,
} from './sign-up-rules';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * `/auth/sign-up`, Create your account (spec 14, board W27): display name, email and password,
 * the documents card ("Accept all", each with "Read") and the 18+ confirmation in its own card,
 * never covered by "Accept all"; "Create account" waits (aria-disabled) until every box is
 * ticked, with one reason line under it ("Accept the documents and confirm your age to
 * continue."), amber after a press. Then the Firebase account (with its display name), the
 * consents (`POST /me/consents`) and the verification email. Google sign-ups collect the same
 * consents on Review our terms.
 */
@Component({
  selector: 'app-sign-up-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ShellIconComponent,
    AuthLayoutComponent,
    GoogleButtonComponent,
    LegalConsentListComponent,
    AgeConfirmationCheckboxComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './sign-up-page.component.html',
  styleUrls: ['../auth-form.scss', './sign-up-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUpPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  protected readonly auth = inject(AuthService);
  protected readonly legal = inject(LegalDocumentsStore);
  private readonly legalTexts = inject(LegalTextsService);

  readonly returnUrl = input<string | undefined>();

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  protected readonly consents = new FormArray<FormControl<boolean>>([]);
  /** Unticked by default; the server records the confirmation (`AGE_CONFIRMATION`). */
  protected readonly ageConfirmed = this.fb.control(false, {
    validators: Validators.requiredTrue,
  });
  protected readonly displayNameMax = DISPLAY_NAME_MAX;
  protected readonly blockerLines = SIGN_UP_BLOCKER_LINES;
  protected readonly form = this.fb.group({
    displayName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
    ageConfirmed: this.ageConfirmed,
  });
  /** Titles follow the active legal language (the linked pages open in that language). */
  protected readonly consentItems = computed<ConsentItem[]>(() =>
    this.legal.requiredAtRegistration().map((doc) => ({
      documentType: doc.documentType,
      title: this.legalTexts.titleOf(doc.url, doc.title),
      url: doc.url,
    })),
  );
  protected readonly submitting = signal(false);
  protected readonly googleBusy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hidePassword = signal(true);
  /** "Create account" was pressed while something was missing: the reason line turns amber. */
  protected readonly tried = signal(false);
  private readonly consentValues = toSignal(
    this.consents.valueChanges.pipe(startWith(this.consents.value)),
    { initialValue: [] as boolean[] },
  );
  private readonly ageValue = toSignal(
    this.ageConfirmed.valueChanges.pipe(startWith(this.ageConfirmed.value)),
    { initialValue: false },
  );
  private readonly nameValue = toSignal(
    this.form.controls.displayName.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  /** What keeps "Create account" waiting (null once every box is ticked). */
  protected readonly blocker = computed(() => {
    const values = this.consentValues();
    return signUpBlocker({
      documentsAccepted:
        this.consentItems().length > 0 &&
        values.length === this.consentItems().length &&
        values.every(Boolean),
      ageNeeded: !!this.legal.ageConfirmation(),
      ageConfirmed: this.ageValue(),
    });
  });
  /** The display name's message, after a submit or once the field was left. */
  protected readonly nameError = computed(() => {
    this.nameValue();
    const control = this.form.controls.displayName;
    return this.submitted() || this.nameTouched() ? displayNameError(control.value) : null;
  });
  private readonly nameTouched = signal(false);
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

  /** A field's message shows once it was left or a submit was tried. */
  protected shows(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    // While a box is unticked the press only turns the reason line amber (board W27); the fields
    // are checked once the button can go.
    if (this.blocker()) {
      this.tried.set(true);
      return;
    }
    this.submitted.set(true);
    if (
      this.form.invalid ||
      displayNameError(this.form.controls.displayName.value) ||
      this.consents.invalid ||
      this.consentItems().length === 0
    ) {
      this.form.markAllAsTouched();
      this.nameTouched.set(true);
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    const { displayName, email, password } = this.form.getRawValue();
    try {
      const current = this.auth.user();
      if (!current || current.email?.toLowerCase() !== email.trim().toLowerCase()) {
        this.step.set('account');
        await this.auth.signUpWithEmail(email, password);
        // The account takes its first display name from the token (the welcome offers it again).
        await this.auth.updateDisplayName(displayName).catch(() => undefined);
        await this.auth.getIdToken(true).catch(() => null);
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
