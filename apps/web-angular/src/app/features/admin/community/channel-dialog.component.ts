import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AdminCommunityChannel, CreateCommunityChannelRequestKindEnum } from '@orenji/api-client';
import { GAMES } from '../../../shared/domain/games';
import {
  CHANNEL_DESCRIPTION_MAX,
  CHANNEL_KINDS,
  CHANNEL_NAME_MAX,
  CHANNEL_REGION_MAX,
  CHANNEL_SLUG_MAX,
  CHANNEL_SLUG_PATTERN,
  ChannelFormValue,
  DEFAULT_RATE_LIMIT,
  RATE_LIMIT_MAX,
  RATE_LIMIT_MIN,
  channelKindLabel,
  slugFromName,
  usesGame,
  usesRegion,
} from './admin-community-labels';

export interface ChannelDialogData {
  /** The channel to edit; absent to create one. */
  channel?: AdminCommunityChannel;
}

/**
 * Create or edit a community channel. The slug and kind are fixed once the channel exists; the
 * game applies to region and game channels, the city to region channels. Closes with the form
 * value (the caller builds the request and handles server refusals).
 */
@Component({
  selector: 'app-channel-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit ' + data.channel!.name : 'New channel' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="channel-form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" [maxlength]="nameMax" required />
          @if (form.controls.name.hasError('required')) {
            <mat-error>A name is required.</mat-error>
          }
        </mat-form-field>

        @if (editing) {
          <p class="channel-form__fixed">
            <span class="mono">{{ data.channel!.slug }}</span> ·
            {{ kindLabel(data.channel!.kind) }}
          </p>
        } @else {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Slug</mat-label>
            <input
              matInput
              formControlName="slug"
              [maxlength]="slugMax"
              required
              spellcheck="false"
            />
            <mat-hint>/community/{{ form.controls.slug.value || '…' }}</mat-hint>
            @if (form.controls.slug.hasError('required')) {
              <mat-error>A slug is required.</mat-error>
            } @else if (form.controls.slug.hasError('pattern')) {
              <mat-error>Lowercase letters, digits and single dashes only.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Kind</mat-label>
            <mat-select formControlName="kind">
              @for (kind of kinds; track kind.value) {
                <mat-option [value]="kind.value">{{ kind.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        @if (showGame()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Game</mat-label>
            <mat-select formControlName="game">
              <mat-option value="">No game</mat-option>
              @for (game of games; track game.slug) {
                <mat-option [value]="game.slug">{{ game.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        @if (showRegion()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>City</mat-label>
            <input matInput formControlName="regionLabel" [maxlength]="regionMax" />
            <mat-hint>A public city name, never an address.</mat-hint>
          </mat-form-field>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="channel-form__wide">
          <mat-label>Description</mat-label>
          <textarea
            matInput
            formControlName="description"
            rows="2"
            [maxlength]="descriptionMax"
          ></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Posts per member per hour</mat-label>
          <input
            matInput
            type="number"
            formControlName="postRateLimitPerHour"
            [min]="rateMin"
            [max]="rateMax"
            required
          />
          @if (form.controls.postRateLimitPerHour.invalid) {
            <mat-error>Between {{ rateMin }} and {{ rateMax }}.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Position in lists</mat-label>
          <input matInput type="number" formControlName="sortOrder" min="0" max="100000" required />
          @if (form.controls.sortOrder.invalid) {
            <mat-error>Between 0 and 100000.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">{{ editing ? 'Save' : 'Create channel' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .channel-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: var(--spacing-4) var(--spacing-3);
      padding-top: var(--spacing-2);
    }
    .channel-form mat-form-field:first-child,
    .channel-form__wide,
    .channel-form__fixed {
      grid-column: 1 / -1;
    }
    .channel-form__fixed {
      margin: 0 0 var(--spacing-4);
      color: var(--color-text-muted);
    }
    @media (max-width: 599px) {
      .channel-form {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelDialogComponent {
  protected readonly data = inject<ChannelDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<ChannelDialogComponent, ChannelFormValue>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly editing = !!this.data.channel;
  protected readonly kinds = CHANNEL_KINDS;
  protected readonly games = GAMES;
  protected readonly nameMax = CHANNEL_NAME_MAX;
  protected readonly slugMax = CHANNEL_SLUG_MAX;
  protected readonly regionMax = CHANNEL_REGION_MAX;
  protected readonly descriptionMax = CHANNEL_DESCRIPTION_MAX;
  protected readonly rateMin = RATE_LIMIT_MIN;
  protected readonly rateMax = RATE_LIMIT_MAX;
  protected readonly kindLabel = channelKindLabel;

  protected readonly form = this.fb.group({
    name: [
      this.data.channel?.name ?? '',
      [Validators.required, Validators.maxLength(CHANNEL_NAME_MAX)],
    ],
    slug: [
      this.data.channel?.slug ?? '',
      [
        Validators.required,
        Validators.maxLength(CHANNEL_SLUG_MAX),
        Validators.pattern(CHANNEL_SLUG_PATTERN),
      ],
    ],
    kind: [
      (this.data.channel?.kind as string as CreateCommunityChannelRequestKindEnum | undefined) ??
        CreateCommunityChannelRequestKindEnum.Region,
    ],
    game: [this.data.channel?.game ?? ''],
    regionLabel: [this.data.channel?.regionLabel ?? '', [Validators.maxLength(CHANNEL_REGION_MAX)]],
    description: [
      this.data.channel?.description ?? '',
      [Validators.maxLength(CHANNEL_DESCRIPTION_MAX)],
    ],
    postRateLimitPerHour: [
      this.data.channel?.postRateLimitPerHour ?? DEFAULT_RATE_LIMIT,
      [Validators.required, Validators.min(RATE_LIMIT_MIN), Validators.max(RATE_LIMIT_MAX)],
    ],
    sortOrder: [
      this.data.channel?.sortOrder ?? 100,
      [Validators.required, Validators.min(0), Validators.max(100_000)],
    ],
  });

  protected readonly showGame = signal(usesGame(this.form.controls.kind.value));
  protected readonly showRegion = signal(usesRegion(this.form.controls.kind.value));
  /** The slug follows the name until the moderator edits it. */
  private slugTouched = this.editing;

  constructor() {
    this.form.controls.kind.valueChanges.pipe(takeUntilDestroyed()).subscribe((kind) => {
      this.showGame.set(usesGame(kind));
      this.showRegion.set(usesRegion(kind));
    });
    this.form.controls.name.valueChanges.pipe(takeUntilDestroyed()).subscribe((name) => {
      if (!this.slugTouched) {
        this.form.controls.slug.setValue(slugFromName(name), { emitEvent: false });
      }
    });
    this.form.controls.slug.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.slugTouched = true;
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(this.form.getRawValue());
  }
}
