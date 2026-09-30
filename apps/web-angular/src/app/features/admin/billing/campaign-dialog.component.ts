import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { AdCampaignRequest, AdminAdCampaign, AdminAdvertiser } from '@orenji/api-client';
import { CAMPAIGN_STATUSES, PRICING_MODELS, statusText } from './admin-billing-labels';
import {
  CampaignFormErrors,
  CampaignFormValue,
  campaignFormValue,
  campaignRequest,
} from './campaign-form';

export interface CampaignDialogData {
  campaign: AdminAdCampaign | null;
  advertisers: readonly AdminAdvertiser[];
}

/**
 * Creates or edits an ad campaign: advertiser, name, status, schedule, budgets, currency,
 * pricing model and bid, priority and frequency cap. Validation mirrors the API
 * (`campaignRequest`); closes with the request.
 */
@Component({
  selector: 'app-campaign-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.campaign ? 'Edit campaign' : 'New campaign' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="campaign-form">
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Advertiser</mat-label>
          <mat-select formControlName="advertiserId">
            @for (advertiser of data.advertisers; track advertiser.id) {
              <mat-option [value]="advertiser.id">{{ advertiser.name }}</mat-option>
            }
          </mat-select>
          @if (errors().advertiserId) {
            <mat-error>{{ errors().advertiserId }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Campaign name</mat-label>
          <input matInput formControlName="name" maxlength="120" />
          @if (errors().name) {
            <mat-error>{{ errors().name }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ text(status) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Pricing</mat-label>
          <mat-select formControlName="pricing">
            @for (pricing of pricings; track pricing) {
              <mat-option [value]="pricing">{{ pricingLabel(pricing) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Starts</mat-label>
          <input matInput type="datetime-local" formControlName="startAt" />
          @if (errors().startAt) {
            <mat-error>{{ errors().startAt }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Ends (optional)</mat-label>
          <input matInput type="datetime-local" formControlName="endAt" />
          @if (errors().endAt) {
            <mat-error>{{ errors().endAt }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Total budget</mat-label>
          <input matInput formControlName="budgetTotal" inputmode="decimal" />
          @if (errors().budgetTotal) {
            <mat-error>{{ errors().budgetTotal }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Daily budget (optional)</mat-label>
          <input matInput formControlName="budgetDaily" inputmode="decimal" />
          <mat-hint>Empty: the rest is spread evenly until the end.</mat-hint>
          @if (errors().budgetDaily) {
            <mat-error>{{ errors().budgetDaily }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Currency</mat-label>
          <input matInput formControlName="currency" maxlength="3" />
          @if (errors().currency) {
            <mat-error>{{ errors().currency }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ bidLabel() }}</mat-label>
          <input matInput formControlName="bidAmount" inputmode="decimal" />
          @if (errors().bidAmount) {
            <mat-error>{{ errors().bidAmount }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Priority (0-100)</mat-label>
          <input matInput formControlName="priority" inputmode="numeric" />
          @if (errors().priority) {
            <mat-error>{{ errors().priority }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Views per member per day</mat-label>
          <input matInput formControlName="frequencyCapPerDay" inputmode="numeric" />
          <mat-hint>Empty: no cap.</mat-hint>
          @if (errors().frequencyCapPerDay) {
            <mat-error>{{ errors().frequencyCapPerDay }}</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">
          {{ data.campaign ? 'Save campaign' : 'Create campaign' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .campaign-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-1) var(--spacing-3);
    }
    .wide {
      grid-column: 1 / -1;
    }
    @media (max-width: 599px) {
      .campaign-form {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampaignDialogComponent {
  protected readonly data = inject<CampaignDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<CampaignDialogComponent, AdCampaignRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly statuses = CAMPAIGN_STATUSES;
  protected readonly pricings = PRICING_MODELS;
  protected readonly text = statusText;
  protected readonly errors = signal<CampaignFormErrors>({});
  private readonly initial = campaignFormValue(this.data.campaign);
  protected readonly form = this.fb.group({
    advertiserId: this.fb.control(this.initial.advertiserId),
    name: this.fb.control(this.initial.name),
    status: this.fb.control(this.initial.status),
    startAt: this.fb.control(this.initial.startAt),
    endAt: this.fb.control(this.initial.endAt),
    budgetTotal: this.fb.control(this.initial.budgetTotal),
    budgetDaily: this.fb.control(this.initial.budgetDaily),
    currency: this.fb.control(this.initial.currency),
    pricing: this.fb.control(this.initial.pricing),
    bidAmount: this.fb.control(this.initial.bidAmount),
    priority: this.fb.control(this.initial.priority),
    frequencyCapPerDay: this.fb.control(this.initial.frequencyCapPerDay),
  });

  protected pricingLabel(pricing: string): string {
    switch (pricing) {
      case 'CPM':
        return 'CPM (per 1000 views)';
      case 'CPC':
        return 'CPC (per click)';
      default:
        return 'Flat fee';
    }
  }

  protected bidLabel(): string {
    switch (this.form.controls.pricing.value) {
      case 'CPM':
        return 'Price per 1000 views';
      case 'CPC':
        return 'Price per click';
      default:
        return 'Bid (not used for flat fees)';
    }
  }

  protected submit(): void {
    const value: CampaignFormValue = this.form.getRawValue();
    const result = campaignRequest(value);
    if (result.errors) {
      this.errors.set(result.errors);
      for (const key of Object.keys(result.errors)) {
        const control = this.form.get(key);
        control?.setErrors({ invalid: true });
        control?.markAsTouched();
      }
      return;
    }
    this.ref.close(result.request);
  }
}
