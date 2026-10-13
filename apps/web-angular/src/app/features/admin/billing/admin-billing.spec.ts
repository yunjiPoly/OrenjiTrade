import type { AdminAdCampaign } from '@orenji/api-client';
import {
  fromLocalInput,
  isUuid,
  parseMoney,
  placementLabel,
  statusText,
  targetingValueError,
  toLocalInput,
} from './admin-billing-labels';
import {
  CampaignFormValue,
  campaignFormValue,
  campaignRequest,
  campaignUpdate,
} from './campaign-form';
import { adUrlError } from './creative-dialog.component';
import { entitlementValueError } from './grant-entitlement-dialog.component';

function form(overrides: Partial<CampaignFormValue> = {}): CampaignFormValue {
  return {
    advertiserId: 'adv-1',
    name: 'Spring sleeves',
    status: 'DRAFT',
    startAt: '2026-10-01T09:00',
    endAt: '2026-10-31T18:00',
    budgetTotal: '250.00',
    budgetDaily: '',
    currency: 'CAD',
    pricing: 'CPM',
    bidAmount: '4.00',
    priority: '10',
    frequencyCapPerDay: '',
    ...overrides,
  };
}

describe('admin billing helpers', () => {
  it('validates targeting values and refuses coordinates', () => {
    expect(targetingValueError('GAME', 'pokemon')).toBeNull();
    expect(targetingValueError('GAME', 'Pokémon!')).toContain('slug');
    expect(targetingValueError('REGION', 'americas-north')).toBeNull();
    expect(targetingValueError('REGION', 'Montréal')).toContain('region code');
    expect(targetingValueError('COUNTRY', 'CA')).toBeNull();
    expect(targetingValueError('COUNTRY', 'Canada')).toContain('two-letter');
    expect(targetingValueError('SUBDIVISION', 'CA-QC')).toBeNull();
    expect(targetingValueError('SUBDIVISION', 'Montréal')).toContain('ISO 3166-2');
    expect(targetingValueError('PLAN', 'ANONYMOUS')).toBeNull();
    expect(targetingValueError('SUBDIVISION', '45.5081, -73.5661')).toContain('Coordinates');
    expect(targetingValueError('TAG', '  ')).toBe('Enter a value.');
  });

  it('builds campaign requests like the API validates them', () => {
    const ok = campaignRequest(form());
    expect(ok.errors).toBeNull();
    expect(ok.request).toMatchObject({
      advertiserId: 'adv-1',
      name: 'Spring sleeves',
      budgetTotal: 250,
      bidAmount: 4,
      priority: 10,
      currency: 'CAD',
    });
    expect(ok.request?.budgetDaily).toBeUndefined();
    expect(ok.request?.frequencyCapPerDay).toBeUndefined();

    const bad = campaignRequest(
      form({
        advertiserId: '',
        endAt: '2026-09-01T00:00',
        budgetTotal: 'lots',
        budgetDaily: '300',
        pricing: 'CPC',
        bidAmount: '',
        frequencyCapPerDay: '0',
      }),
    );
    expect(Object.keys(bad.errors ?? {}).sort()).toEqual([
      'advertiserId',
      'bidAmount',
      'budgetTotal',
      'endAt',
      'frequencyCapPerDay',
    ]);
    expect(bad.errors?.bidAmount).toBe('Enter the price per click.');

    const flat = campaignRequest(form({ pricing: 'FLAT', bidAmount: '' }));
    expect(flat.request?.bidAmount).toBeUndefined();
    expect(campaignRequest(form({ budgetDaily: '500' })).errors?.budgetDaily).toContain(
      'cannot exceed',
    );
  });

  it('keeps a campaign as it is when only its status changes', () => {
    const campaign: AdminAdCampaign = {
      id: 'c-1',
      advertiserId: 'adv-1',
      name: 'House ad',
      status: 'ACTIVE' as AdminAdCampaign['status'],
      startAt: '2026-09-29T17:30:22.123Z',
      budgetTotal: 0,
      currency: 'CAD',
      pricing: 'FLAT' as AdminAdCampaign['pricing'],
      bidAmount: 0,
      priority: 0,
      frequencyCapPerDay: 3,
    };
    expect(campaignUpdate(campaign, { status: 'PAUSED' as never })).toEqual({
      advertiserId: 'adv-1',
      name: 'House ad',
      status: 'PAUSED',
      startAt: '2026-09-29T17:30:22.123Z',
      budgetTotal: 0,
      currency: 'CAD',
      pricing: 'FLAT',
      bidAmount: 0,
      priority: 0,
      frequencyCapPerDay: 3,
    });
    expect(campaignFormValue(campaign).frequencyCapPerDay).toBe('3');
  });

  it('checks landing URLs, entitlement values, money, ids and dates', () => {
    expect(adUrlError('https://maplesleeve.example/sleeves')).toBeNull();
    expect(adUrlError('/premium')).toBeNull();
    expect(adUrlError('http://insecure.example')).toContain('https');
    expect(adUrlError('javascript:alert(1)')).toContain('https');
    expect(adUrlError('//evil.example')).toContain('https');

    expect(entitlementValueError('limit', 'unlimited')).toBeNull();
    expect(entitlementValueError('limit', '120')).toBeNull();
    expect(entitlementValueError('limit', '-1')).toContain('whole number');
    expect(entitlementValueError('feature', 'true')).toBeNull();
    expect(entitlementValueError('feature', 'yes')).toContain('on or off');

    expect(parseMoney('12.50')).toBe(12.5);
    expect(parseMoney('12,5')).toBe(12.5);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('1.234')).toBeNaN();
    expect(isUuid('00000000-0000-4000-8000-000000000009')).toBe(true);
    expect(isUuid('collector1')).toBe(false);

    const local = toLocalInput('2026-10-01T13:45:00Z');
    expect(local).toMatch(/^2026-10-0[12]T\d{2}:45$/);
    expect(fromLocalInput(local)).toBe('2026-10-01T13:45:00.000Z');
    expect(fromLocalInput('')).toBeNull();

    expect(placementLabel('MAP_PANEL')).toBe('Map panel');
    expect(statusText('PAST_DUE')).toBe('Past due');
  });
});
