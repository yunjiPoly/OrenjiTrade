import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { DonationCheckoutRequest } from '@orenji/api-client';
import { donationRequest, parseAmount } from './donation-form';
import { DonationFormComponent } from './donation-form.component';
import { supporterMonth } from './supporters-list.component';

describe('donation form helpers', () => {
  it('parses amounts with dot or comma decimals', () => {
    expect(parseAmount('10')).toBe(10);
    expect(parseAmount('7.5')).toBe(7.5);
    expect(parseAmount('7,25')).toBe(7.25);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('builds the checkout request from a preset or a custom amount', () => {
    expect(
      donationRequest({
        preset: '25',
        custom: '',
        currency: 'CAD',
        message: '  ',
        publicThanks: false,
      }),
    ).toEqual({ amount: 25, currency: 'CAD', publicThanks: false });
    expect(
      donationRequest({
        preset: 'other',
        custom: '12,5',
        currency: 'USD',
        message: ' Thanks! ',
        publicThanks: true,
      }),
    ).toEqual({ amount: 12.5, currency: 'USD', message: 'Thanks!', publicThanks: true });
    expect(
      donationRequest({
        preset: 'other',
        custom: '',
        currency: 'CAD',
        message: '',
        publicThanks: false,
      }),
    ).toBeNull();
  });

  it('formats supporter months', () => {
    expect(supporterMonth('2026-09')).toBe('September 2026');
    expect(supporterMonth('bad')).toBe('');
  });
});

describe('DonationFormComponent', () => {
  let fixture: ComponentFixture<DonationFormComponent>;
  let element: HTMLElement;
  let emitted: DonationCheckoutRequest[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DonationFormComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DonationFormComponent);
    element = fixture.nativeElement as HTMLElement;
    emitted = [];
    fixture.componentInstance.donate.subscribe((request) => emitted.push(request));
    await fixture.whenStable();
  });

  function submit(): void {
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  }

  it('donates the default preset', async () => {
    expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Donate $10');
    submit();
    expect(emitted).toEqual([{ amount: 10, currency: 'CAD', publicThanks: false }]);
  });

  it('asks for a valid custom amount under "Other"', async () => {
    const other = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Other',
    )!;
    other.click();
    await fixture.whenStable();
    const input = element.querySelector<HTMLInputElement>(
      '[data-testid="donation-custom-amount"]',
    )!;
    input.value = '1.234';
    input.dispatchEvent(new Event('input'));
    submit();
    await fixture.whenStable();
    expect(emitted).toEqual([]);
    expect(element.textContent).toContain('Enter a positive amount with at most two decimals.');

    input.value = '15';
    input.dispatchEvent(new Event('input'));
    submit();
    expect(emitted).toEqual([{ amount: 15, currency: 'CAD', publicThanks: false }]);
  });

  it('shows the API refusal of a custom amount on the field', async () => {
    const other = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Other',
    )!;
    other.click();
    await fixture.whenStable();
    const input = element.querySelector<HTMLInputElement>(
      '[data-testid="donation-custom-amount"]',
    )!;
    input.value = '1';
    input.dispatchEvent(new Event('input'));
    fixture.componentRef.setInput('serverErrors', {
      amount: 'The amount must be between 2.00 and 500.00.',
      currency: null,
    });
    await fixture.whenStable();
    expect(element.textContent).toContain('The amount must be between 2.00 and 500.00.');
  });
});
