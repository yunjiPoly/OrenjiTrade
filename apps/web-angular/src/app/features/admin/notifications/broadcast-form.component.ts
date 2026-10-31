import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { BroadcastRequest, BroadcastRequestAudienceEnum } from '@orenji/api-client';

export const BROADCAST_TITLE_MAX = 200;
export const BROADCAST_BODY_MAX = 1000;
/** Same rule as the API (`NotificationAdminService.DEEP_LINK`). */
export const DEEP_LINK_PATTERN = /^\/[A-Za-z0-9/_?=&.%-]{0,199}$/;

function deepLinkValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  return !value || DEEP_LINK_PATTERN.test(value) ? null : { deepLink: true };
}

/**
 * Broadcast composer (SUPER_ADMIN): title, body, audience (every reachable account or staff
 * only) and an optional in-app link. Emits the request; the page confirms and sends it.
 */
@Component({
  selector: 'app-broadcast-form',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="bc">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="broadcast">
        <mat-form-field appearance="outline">
          <mat-label>Title</mat-label>
          <input matInput formControlName="title" [attr.maxlength]="titleMax" required />
          <mat-hint>The first line people read.</mat-hint>
          <mat-hint align="end">{{ form.controls.title.value.length }} / {{ titleMax }}</mat-hint>
          @if (form.controls.title.hasError('required')) {
            <mat-error>A title is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Message</mat-label>
          <textarea
            matInput
            formControlName="body"
            rows="4"
            [attr.maxlength]="bodyMax"
            required
          ></textarea>
          <mat-hint>Plain text.</mat-hint>
          <mat-hint align="end"
            >{{ form.controls.body.value.length.toLocaleString('en-US') }} /
            {{ bodyMax.toLocaleString('en-US') }}</mat-hint
          >
          @if (form.controls.body.hasError('required')) {
            <mat-error>A message is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Link in the app (optional)</mat-label>
          <input matInput formControlName="deepLink" placeholder="/messages" />
          <mat-hint>A path such as /wishlist or /messages.</mat-hint>
          @if (form.controls.deepLink.hasError('deepLink')) {
            <mat-error>Use an app path starting with /.</mat-error>
          }
        </mat-form-field>
        <fieldset class="bc__audience">
          <legend class="broadcast__label">Audience</legend>
          <label class="bc__radio" [class.bc__radio--on]="form.controls.audience.value === 'STAFF'">
            <input type="radio" formControlName="audience" value="STAFF" />
            <span>
              <strong>Staff only (test first)</strong>
              <span class="bc__line">Moderators and administrators</span>
            </span>
          </label>
          <label class="bc__radio" [class.bc__radio--on]="form.controls.audience.value === 'ALL'">
            <input type="radio" formControlName="audience" value="ALL" />
            <span>
              <strong>Every collector</strong>
              <span class="bc__line">Every reachable account</span>
            </span>
          </label>
        </fieldset>
        <p class="bc__line">
          One in-app notice per account, never by push or email. People who turned off in-app
          notifications are skipped. It can't be recalled.
        </p>
        <div class="broadcast__actions">
          <span class="bc__line">{{
            form.controls.audience.value === 'STAFF'
              ? 'Goes to the staff accounts, so you can check it first.'
              : 'Goes to every collector.'
          }}</span>
          <button matButton="filled" type="submit" [disabled]="busy()">
            {{ busy() ? 'Sending…' : 'Send announcement' }}
          </button>
        </div>
      </form>
      <aside class="bc__preview" aria-labelledby="bc-preview">
        <h3 class="broadcast__label" id="bc-preview">How it shows in the app</h3>
        <div class="bc__notice">
          <p class="bc__notice-title">
            {{ form.controls.title.value.trim() || 'Your title' }}
            <span class="bc__line">now</span>
          </p>
          <p class="bc__notice-body">{{ form.controls.body.value.trim() || 'Your message.' }}</p>
          <p class="bc__line">Announcement from OrenjiTrade</p>
          @if (form.controls.deepLink.value.trim()) {
            <p class="bc__line">
              Opens <code>{{ form.controls.deepLink.value.trim() }}</code>
            </p>
          }
        </div>
        <p class="bc__line">
          Announcements appear only in the app's notifications: no push, no email.
        </p>
      </aside>
    </div>
  `,
  styles: `
    .bc {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 24px;
      align-items: start;
    }
    .broadcast {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .broadcast__label {
      margin: 0 0 8px;
      padding: 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .bc__audience {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin: 8px 0 4px;
      padding: 0;
      border: 0;
    }
    .bc__radio {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--color-border-strong);
      border-radius: 12px;
      cursor: pointer;
    }
    .bc__radio--on {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .bc__radio input {
      margin-top: 3px;
      accent-color: var(--color-primary);
    }
    .bc__radio:focus-within {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .bc__line {
      display: block;
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .broadcast__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 12px;
    }
    .bc__notice {
      margin-bottom: 12px;
      padding: 14px;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      background: var(--color-background);
    }
    .bc__notice p {
      margin: 0 0 6px;
    }
    .bc__notice-title {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .bc__notice-body {
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    @media (max-width: 1279.98px) {
      .bc {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BroadcastFormComponent {
  readonly busy = input(false);
  readonly send = output<BroadcastRequest>();

  protected readonly titleMax = BROADCAST_TITLE_MAX;
  protected readonly bodyMax = BROADCAST_BODY_MAX;
  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(BROADCAST_TITLE_MAX)],
    }),
    body: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(BROADCAST_BODY_MAX)],
    }),
    deepLink: new FormControl('', { nonNullable: true, validators: [deepLinkValidator] }),
    audience: new FormControl<'ALL' | 'STAFF'>('STAFF', { nonNullable: true }),
  });

  /** Clears the composer after a successful send. */
  reset(): void {
    this.form.reset();
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (!value.title.trim()) {
      this.form.controls.title.setValue('');
    }
    if (!value.body.trim()) {
      this.form.controls.body.setValue('');
    }
    if (this.form.invalid || !value.title.trim() || !value.body.trim()) {
      this.form.markAllAsTouched();
      return;
    }
    const deepLink = value.deepLink.trim();
    this.send.emit({
      title: value.title.trim(),
      body: value.body.trim(),
      audience: value.audience as BroadcastRequestAudienceEnum,
      ...(deepLink ? { deepLink } : {}),
    });
  }
}
