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
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';
import { LegalDocumentsStore } from '../data/legal-documents.store';
import {
  ConsentItem,
  LegalConsentListComponent,
} from '../legal-consent-list/legal-consent-list.component';

/**
 * `/auth/consent`: shown when the API answers 428 `TERMS_ACCEPTANCE_REQUIRED` (new documents,
 * new versions, or a Google sign-up). Records each acceptance, then continues.
 */
@Component({
  selector: 'app-consent-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AuthLayoutComponent,
    LegalConsentListComponent,
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
  protected readonly session = inject(SessionService);

  readonly returnUrl = input<string | undefined>();

  protected readonly consents = new FormArray<FormControl<boolean>>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly items = computed<ConsentItem[]>(() => {
    // Reading the documents keeps titles fresh once they load.
    this.legal.documents();
    return this.session.requiredConsents().map((consent) => ({
      documentType: consent.documentType,
      ...this.legal.describe(consent),
    }));
  });

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
    if (this.consents.invalid) {
      this.consents.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.session.acceptConsents(this.session.requiredConsents());
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
