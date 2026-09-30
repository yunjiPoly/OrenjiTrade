import type { AdCampaignRequest, AdminAdCampaign } from '@orenji/api-client';
import { fromLocalInput, parseMoney, toLocalInput } from './admin-billing-labels';

/** Raw values of the campaign form (strings from the inputs). */
export interface CampaignFormValue {
  advertiserId: string;
  name: string;
  status: string;
  startAt: string;
  endAt: string;
  budgetTotal: string;
  budgetDaily: string;
  currency: string;
  pricing: string;
  bidAmount: string;
  priority: string;
  frequencyCapPerDay: string;
}

export type CampaignFormErrors = Partial<Record<keyof CampaignFormValue, string>>;

/** The form values of an existing campaign (or the defaults of a new one). */
export function campaignFormValue(campaign: AdminAdCampaign | null): CampaignFormValue {
  const now = new Date();
  now.setSeconds(0, 0);
  return {
    advertiserId: campaign?.advertiserId ?? '',
    name: campaign?.name ?? '',
    status: campaign?.status ?? 'DRAFT',
    startAt: toLocalInput(campaign?.startAt ?? now.toISOString()),
    endAt: toLocalInput(campaign?.endAt),
    budgetTotal: campaign?.budgetTotal !== undefined ? String(campaign.budgetTotal) : '',
    budgetDaily:
      campaign?.budgetDaily !== undefined && campaign.budgetDaily !== null
        ? String(campaign.budgetDaily)
        : '',
    currency: campaign?.currency ?? 'CAD',
    pricing: campaign?.pricing ?? 'CPM',
    bidAmount:
      campaign?.bidAmount !== undefined && campaign.bidAmount !== null
        ? String(campaign.bidAmount)
        : '',
    priority: campaign?.priority !== undefined ? String(campaign.priority) : '0',
    frequencyCapPerDay:
      campaign?.frequencyCapPerDay !== undefined && campaign.frequencyCapPerDay !== null
        ? String(campaign.frequencyCapPerDay)
        : '',
  };
}

function intOrNull(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  return /^\d{1,6}$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * Validates the campaign form and builds the request (`POST/PUT /admin/ads/campaigns`), mirroring
 * the API's rules: a schedule that ends after it starts, positive budgets (daily ≤ total), a bid
 * for CPM / CPC, priority 0-100, frequency cap 1-100.
 */
export function campaignRequest(
  value: CampaignFormValue,
): { request: AdCampaignRequest; errors: null } | { request: null; errors: CampaignFormErrors } {
  const errors: CampaignFormErrors = {};
  const startAt = fromLocalInput(value.startAt);
  const endAt = fromLocalInput(value.endAt);
  const budgetTotal = parseMoney(value.budgetTotal);
  const budgetDaily = parseMoney(value.budgetDaily);
  const bidAmount = parseMoney(value.bidAmount);
  const priority = intOrNull(value.priority);
  const cap = intOrNull(value.frequencyCapPerDay);

  if (!value.advertiserId) {
    errors.advertiserId = 'Choose the advertiser.';
  }
  if (!value.name.trim()) {
    errors.name = 'Enter a campaign name.';
  } else if (value.name.trim().length > 120) {
    errors.name = 'Keep it under 120 characters.';
  }
  if (!startAt) {
    errors.startAt = 'Choose when the campaign starts.';
  }
  if (value.endAt && !endAt) {
    errors.endAt = 'Enter a valid end.';
  } else if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
    errors.endAt = 'The end must be after the start.';
  }
  if (budgetTotal === null || Number.isNaN(budgetTotal)) {
    errors.budgetTotal = 'Enter the total budget (e.g. 250.00).';
  }
  if (budgetDaily !== null && Number.isNaN(budgetDaily)) {
    errors.budgetDaily = 'Enter an amount like 10.00, or leave it empty.';
  } else if (
    budgetDaily !== null &&
    budgetTotal !== null &&
    !Number.isNaN(budgetTotal) &&
    budgetDaily > budgetTotal
  ) {
    errors.budgetDaily = 'The daily budget cannot exceed the total budget.';
  }
  if (!/^[A-Z]{3}$/.test(value.currency)) {
    errors.currency = 'Use a 3-letter currency code.';
  }
  if (value.pricing !== 'FLAT') {
    if (bidAmount === null || Number.isNaN(bidAmount) || bidAmount <= 0) {
      errors.bidAmount =
        value.pricing === 'CPC' ? 'Enter the price per click.' : 'Enter the price per 1000 views.';
    }
  } else if (bidAmount !== null && Number.isNaN(bidAmount)) {
    errors.bidAmount = 'Enter an amount like 0.40, or leave it empty.';
  }
  if (priority !== null && (Number.isNaN(priority) || priority > 100)) {
    errors.priority = '0 to 100.';
  }
  if (cap !== null && (Number.isNaN(cap) || cap < 1 || cap > 100)) {
    errors.frequencyCapPerDay = '1 to 100, or empty for no cap.';
  }
  if (Object.keys(errors).length) {
    return { request: null, errors };
  }
  return {
    request: {
      advertiserId: value.advertiserId,
      name: value.name.trim(),
      status: value.status as AdCampaignRequest['status'],
      startAt: startAt!,
      ...(endAt ? { endAt } : {}),
      budgetTotal: budgetTotal!,
      ...(budgetDaily !== null ? { budgetDaily } : {}),
      currency: value.currency,
      pricing: value.pricing as AdCampaignRequest['pricing'],
      ...(bidAmount !== null && value.pricing !== 'FLAT' ? { bidAmount } : {}),
      ...(priority !== null ? { priority } : {}),
      ...(cap !== null ? { frequencyCapPerDay: cap } : {}),
    },
    errors: null,
  };
}

/** The full update request of an existing campaign with `changes` (status changes keep the rest). */
export function campaignUpdate(
  campaign: AdminAdCampaign,
  changes: Partial<AdCampaignRequest>,
): AdCampaignRequest {
  return {
    advertiserId: campaign.advertiserId ?? '',
    name: campaign.name ?? '',
    status: campaign.status as string as AdCampaignRequest['status'],
    startAt: campaign.startAt ?? new Date().toISOString(),
    ...(campaign.endAt ? { endAt: campaign.endAt } : {}),
    budgetTotal: campaign.budgetTotal ?? 0,
    ...(campaign.budgetDaily !== undefined && campaign.budgetDaily !== null
      ? { budgetDaily: campaign.budgetDaily }
      : {}),
    currency: campaign.currency ?? 'CAD',
    pricing: campaign.pricing as string as AdCampaignRequest['pricing'],
    ...(campaign.bidAmount !== undefined && campaign.bidAmount !== null
      ? { bidAmount: campaign.bidAmount }
      : {}),
    ...(campaign.priority !== undefined ? { priority: campaign.priority } : {}),
    ...(campaign.frequencyCapPerDay !== undefined && campaign.frequencyCapPerDay !== null
      ? { frequencyCapPerDay: campaign.frequencyCapPerDay }
      : {}),
    ...changes,
  };
}
