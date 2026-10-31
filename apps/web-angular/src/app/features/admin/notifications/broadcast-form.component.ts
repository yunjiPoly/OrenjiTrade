import { DatePipe } from '@angular/common';
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
import { BroadcastRequest, BroadcastRequestAudienceEnum } from '@orenji/api-client';

/** The newest announcement, from the audit log (board A20's "Last sent"). */
export interface LastBroadcast {
  at: string;
  audience: 'ALL' | 'STAFF' | null;
}

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
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule],
  styleUrls: ['../console/console-form.scss'],
  template: `
    <div class="bc">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="broadcast">
        <div class="cf">
          <div class="cf__top">
            <label class="cf__label" for="bc-title">Title</label>
            <span class="cf__count" aria-hidden="true"
              >{{ form.controls.title.value.length }} / {{ titleMax }}</span
            >
          </div>
          <input
            id="bc-title"
            class="cf__control"
            formControlName="title"
            [attr.maxlength]="titleMax"
            required
            [attr.aria-invalid]="showError('title')"
            aria-describedby="bc-title-help"
          />
          @if (showError('title')) {
            <p class="cf__error" id="bc-title-help">A title is required.</p>
          } @else {
            <p class="cf__help" id="bc-title-help">The first line people read.</p>
          }
        </div>
        <div class="cf">
          <div class="cf__top">
            <label class="cf__label" for="bc-body">Message</label>
            <span class="cf__count" aria-hidden="true"
              >{{ form.controls.body.value.length.toLocaleString('en-US') }} /
              {{ bodyMax.toLocaleString('en-US') }}</span
            >
          </div>
          <textarea
            id="bc-body"
            class="cf__control"
            formControlName="body"
            rows="4"
            [attr.maxlength]="bodyMax"
            required
            [attr.aria-invalid]="showError('body')"
            aria-describedby="bc-body-help"
          ></textarea>
          @if (showError('body')) {
            <p class="cf__error" id="bc-body-help">A message is required.</p>
          } @else {
            <p class="cf__help" id="bc-body-help">Plain text.</p>
          }
        </div>
        <div class="cf">
          <label class="cf__label" for="bc-link">Link in the app (optional)</label>
          <input
            id="bc-link"
            class="cf__control"
            formControlName="deepLink"
            placeholder="/messages"
            [attr.aria-invalid]="showError('deepLink')"
            aria-describedby="bc-link-help"
          />
          @if (showError('deepLink')) {
            <p class="cf__error" id="bc-link-help">Use an app path starting with /.</p>
          } @else {
            <p class="cf__help" id="bc-link-help">A path such as /wishlist or /messages.</p>
          }
        </div>
        <fieldset class="cf-choices bc__audience">
          <legend>Audience</legend>
          <label class="cf-choice" [class.cf-choice--on]="form.controls.audience.value === 'STAFF'">
            <input type="radio" formControlName="audience" value="STAFF" />
            <span>
              <strong>Staff only (test first)</strong>
              <span class="cf__help">Moderators and administrators</span>
            </span>
          </label>
          <label class="cf-choice" [class.cf-choice--on]="form.controls.audience.value === 'ALL'">
            <input type="radio" formControlName="audience" value="ALL" />
            <span>
              <strong>Every collector</strong>
              <span class="cf__help">Every reachable account</span>
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
        <dl class="bc__facts">
          <div>
            <dt>Audience</dt>
            <dd>{{ form.controls.audience.value === 'ALL' ? 'Every collector' : 'Staff only' }}</dd>
          </div>
          <div>
            <dt>Last sent</dt>
            <dd>
              @if (lastSent(); as last) {
                {{ last.at | date: 'MMM d' }} ·
                {{
                  last.audience === 'ALL'
                    ? 'every collector'
                    : last.audience === 'STAFF'
                      ? 'staff only'
                      : 'audience not recorded'
                }}
              } @else if (lastSent() === null) {
                Never
              } @else {
                Not known
              }
            </dd>
          </div>
        </dl>
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
      gap: 16px;
    }
    .bc__facts {
      display: grid;
      gap: 10px;
      margin: 14px 0 0;
    }
    .bc__facts dt {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .bc__facts dd {
      margin: 2px 0 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .broadcast__label {
      margin: 0 0 8px;
      padding: 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .bc__audience {
      margin: 4px 0 0;
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
  /**
   * The newest announcement (board A20's "Last sent"): `null` when none was sent, `undefined`
   * while unknown (not loaded, or the audit log could not be read).
   */
  readonly lastSent = input<LastBroadcast | null | undefined>(undefined);
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

  /** A field's error shows once it was touched or a send was tried (as Material's did). */
  protected showError(name: 'title' | 'body' | 'deepLink'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

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
