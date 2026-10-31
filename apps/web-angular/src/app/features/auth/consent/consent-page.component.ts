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
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { isApiError } from '../../../core/http/api-error';
import { ToastService } from '../../../core/feedback/toast.service';
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
import {
  ConsentItem,
  LegalConsentListComponent,
} from '../legal-consent-list/legal-consent-list.component';

/** Review our terms' words (the phone's R12 `CONSENT_COPY`). */
export const CONSENT_COPY = {
  intro: 'Please accept the current versions of these documents to keep using OrenjiTrade.',
  ageOnlyIntro: 'Please confirm your age to keep using OrenjiTrade.',
  missing: 'Accept every document and confirm your age to continue.',
  welcomeBack: 'Thanks for confirming. Welcome back!',
} as const;

/**
 * `/auth/consent`, Review our terms (spec 14, an account state: a centred 480 card): shown when the
 * API answers 428 `TERMS_ACCEPTANCE_REQUIRED` (new documents, new versions, a Google sign-up) or
 * the account never confirmed being 18 or older (`onboarding.ageConfirmed === false`; alone when
 * no document is due, as on the phone since R12: the welcome never asks it). Records each
 * acceptance and the confirmation, then continues where the collector was going.
 */
@Component({
  selector: 'app-consent-page',
  imports: [
    ShellIconComponent,
    AuthLayoutComponent,
    LegalConsentListComponent,
    AgeConfirmationCheckboxComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <app-auth-layout card heading="Review our terms" icon="fileText" [lead]="lead()">
      @if (error(); as message) {
        <div class="form__alert" role="alert">
          <app-shell-icon name="alert" [size]="18" />
          <p>{{ message }}</p>
        </div>
      }

      @if (loading()) {
        <div class="skeleton-block" aria-busy="true">
          <span class="visually-hidden">Loading the documents</span>
          <app-skeleton variant="list" lines="3" />
        </div>
      } @else if (session.status() === 'error' && session.error(); as sessionError) {
        <div class="skeleton-block">
          <app-error-state
            title="We could not load your account"
            [message]="sessionError.message"
            (retry)="reload()"
          />
        </div>
      } @else if (items().length === 0 && !ageConfirmationPending()) {
        <div class="form__alert form__alert--success" role="status">
          <app-shell-icon name="checkCircle" [size]="18" />
          <p>You have accepted every current document.</p>
        </div>
        <button type="button" class="btn btn--primary btn--first" (click)="continue()">
          Continue
        </button>
      } @else {
        <div class="form">
          @if (items().length > 0) {
            <app-legal-consent-list [items]="items()" [formArray]="consents" [warn]="tried()" />
          }
          @if (ageConfirmationPending()) {
            <app-age-confirmation-checkbox [control]="ageConfirmed" [warn]="tried()" />
          }
          @if (tried() && missing()) {
            <p class="field__error consent__missing" role="alert">{{ copy.missing }}</p>
          }
          <button
            type="button"
            class="btn btn--primary btn--first"
            [attr.aria-disabled]="saving() ? 'true' : null"
            (click)="saving() || accept()"
          >
            {{ saving() ? 'Saving…' : 'Accept and continue' }}
          </button>
        </div>
      }
      <p class="foot foot--close">
        Not now?
        <button type="button" class="link" (click)="signOut()">Sign out</button>
      </p>
    </app-auth-layout>
  `,
  styleUrl: '../auth-form.scss',
  styles: `
    .consent__missing {
      margin-top: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
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
  protected readonly tried = signal(false);
  protected readonly copy = CONSENT_COPY;
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
  /** Only the age is asked: the lead says so (the phone's words). */
  protected readonly lead = computed(() =>
    this.items().length === 0 && this.ageConfirmationPending()
      ? CONSENT_COPY.ageOnlyIntro
      : CONSENT_COPY.intro,
  );
  /** Something is still unticked. */
  protected missing(): boolean {
    return this.consents.invalid || (this.ageConfirmationPending() && this.ageConfirmed.invalid);
  }

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
    this.tried.set(true);
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
      const ageOnly = this.items().length === 0;
      await this.session.acceptConsents(consents);
      if (ageOnly) {
        // Only the age was asked (an account from before the 18+ rule): the phone's words.
        this.toasts.show({ title: CONSENT_COPY.welcomeBack });
      }
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
    await this.router.navigateByUrl('/');
  }
}
