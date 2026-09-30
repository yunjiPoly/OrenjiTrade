import { Clipboard } from '@angular/cdk/clipboard';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { MyReferral } from '@orenji/api-client';
import { creditsLabel } from '../../shared/billing/billing-labels';

/** Referral codes accept letters, digits, spaces and dashes (the API ignores case, spaces, dashes). */
const CODE_PATTERN = /^[A-Za-z0-9 -]{3,32}$/;

/**
 * The member's referral code (copy / share) with the rewards for both sides, and the form to
 * redeem another member's code once, shortly after joining. The page performs the redemption
 * and passes back the refusal (`error`) or clears it.
 */
@Component({
  selector: 'app-referral-card',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="ref">
      <section class="ref__share" aria-labelledby="ref-share-title">
        <h3 id="ref-share-title" class="ref__title">Invite a collector</h3>
        <p class="ref__text">
          When a new collector redeems your code, they get
          <strong>{{ credits(referral().refereeReward) }}</strong> and you get
          <strong>{{ credits(referral().referrerReward) }}</strong
          >.
        </p>
        <div class="ref__code-row">
          <code class="ref__code" data-testid="referral-code">{{ referral().code }}</code>
          <button matButton="tonal" type="button" (click)="copy()">
            <mat-icon aria-hidden="true">{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
            {{ copied() ? 'Copied' : 'Copy code' }}
          </button>
          @if (canShare) {
            <button matButton type="button" (click)="share()">
              <mat-icon aria-hidden="true">share</mat-icon>
              Share
            </button>
          }
        </div>
        <p class="ref__meta">
          Redeemed {{ referral().redemptions ?? 0 }}
          {{ referral().redemptions === 1 ? 'time' : 'times' }} so far.
        </p>
      </section>

      <section class="ref__redeem" aria-labelledby="ref-redeem-title">
        <h3 id="ref-redeem-title" class="ref__title">Got a code?</h3>
        @if (referral().redeemed) {
          <p class="ref__text ref__text--icon">
            <mat-icon class="ref__ok" aria-hidden="true">check_circle</mat-icon>
            You already redeemed a referral code. Thanks for joining through a friend!
          </p>
        } @else if (referral().canRedeem === false) {
          <p class="ref__text">
            Referral codes can only be redeemed shortly after joining, and that window has closed.
          </p>
        } @else {
          <form class="ref__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Referral code</mat-label>
              <input
                matInput
                formControlName="code"
                autocomplete="off"
                autocapitalize="characters"
                maxlength="32"
              />
              @if (referral().redeemBefore) {
                <mat-hint
                  >Redeem before {{ referral().redeemBefore | date: 'mediumDate' }}.</mat-hint
                >
              }
              @if (form.controls.code.hasError('required')) {
                <mat-error>Enter the code another collector shared with you.</mat-error>
              } @else if (form.controls.code.hasError('pattern')) {
                <mat-error>Codes use letters and digits (3 to 32).</mat-error>
              } @else if (form.controls.code.hasError('server')) {
                <mat-error>{{ error() }}</mat-error>
              }
            </mat-form-field>
            <button matButton="filled" type="submit" [disabled]="redeeming()">
              {{ redeeming() ? 'Redeeming…' : 'Redeem' }}
            </button>
          </form>
        }
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .ref {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--spacing-4);
    }
    .ref__share,
    .ref__redeem {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .ref__title {
      margin: 0;
      font-size: var(--font-size-md);
    }
    .ref__text {
      margin: 0;
      color: var(--color-text-muted);
    }
    .ref__text--icon {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .ref__text strong {
      color: var(--color-ink);
    }
    .ref__ok {
      color: var(--color-success);
    }
    .ref__code-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
    .ref__code {
      padding: var(--spacing-2) var(--spacing-4);
      border: 2px dashed var(--color-primary);
      border-radius: var(--radius-md);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-family: var(--font-mono);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      letter-spacing: 0.08em;
    }
    .ref__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ref__form {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .ref__form mat-form-field {
      flex: 1 1 200px;
    }
    .ref__form button {
      margin-top: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferralCardComponent {
  private readonly clipboard = inject(Clipboard);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly referral = input.required<MyReferral>();
  readonly redeeming = input(false);
  /** The refusal of the last redemption (shown on the field). */
  readonly error = input<string | null>(null);

  readonly redeem = output<string>();

  protected readonly credits = creditsLabel;
  protected readonly copied = signal(false);
  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required, Validators.pattern(CODE_PATTERN)]),
  });
  private readonly shareText = computed(
    () =>
      `Join me on OrenjiTrade, the map of card collectors near you. Use my referral code ${this.referral().code} to get ${creditsLabel(this.referral().refereeReward)}.`,
  );

  constructor() {
    effect(() => {
      const message = this.error();
      const control = this.form.controls.code;
      if (message) {
        control.setErrors({ ...(control.errors ?? {}), server: true });
        control.markAsTouched();
      } else if (control.hasError('server')) {
        control.updateValueAndValidity();
      }
    });
  }

  protected copy(): void {
    this.copied.set(this.clipboard.copy(this.referral().code ?? ''));
    setTimeout(() => this.copied.set(false), 2500);
  }

  protected async share(): Promise<void> {
    try {
      await navigator.share({ title: 'OrenjiTrade', text: this.shareText() });
    } catch {
      // The member closed the share sheet.
    }
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid && !this.form.controls.code.hasError('server')) {
      return;
    }
    const code = this.form.controls.code.value.trim();
    if (!CODE_PATTERN.test(code)) {
      return;
    }
    this.redeem.emit(code);
  }
}
