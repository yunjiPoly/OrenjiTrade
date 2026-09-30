import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PaymentsService, SellerAccount } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { PayoutSettingsComponent } from './payout-settings.component';

@Component({ template: '' })
class BlankComponent {}

function account(overrides: Record<string, unknown> = {}): SellerAccount {
  return {
    provider: 'fake',
    status: 'NOT_STARTED',
    payoutsEnabled: false,
    ready: false,
    updatedAt: null,
    ...overrides,
  } as SellerAccount;
}

describe('PayoutSettingsComponent', () => {
  let fixture: ComponentFixture<PayoutSettingsComponent>;
  let element: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  async function create(inputs: Record<string, string> = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: BlankComponent }]),
        { provide: PaymentsService, useValue: api },
      ],
    });
    fixture = TestBed.createComponent(PayoutSettingsComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    );
  }

  beforeEach(() => {
    api = {
      getSellerAccount: vi.fn(() => of(account())),
      startSellerOnboarding: vi.fn(() =>
        of({
          url: '/settings/payouts?returnTo=%2Ftrades%2Ft-1&onboarding=complete',
          account: account({ status: 'ACTIVE', payoutsEnabled: true, ready: true }),
        }),
      ),
    };
  });

  it('sets up payouts through the provider and comes back to the trade', async () => {
    await create({ returnTo: '/trades/t-1' });
    expect(element.querySelector('[data-testid="payout-status"]')?.textContent).toContain(
      'Not set up',
    );
    expect(element.textContent).toContain('Local test provider');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button('Set up payouts')?.click();
    await fixture.whenStable();
    expect(api['startSellerOnboarding']).toHaveBeenCalledWith(
      { sellerOnboardingRequest: { returnUrl: '/settings/payouts?returnTo=%2Ftrades%2Ft-1' } },
      'body',
      false,
      expect.anything(),
    );
    expect(navigate).toHaveBeenCalledWith(
      '/settings/payouts?returnTo=%2Ftrades%2Ft-1&onboarding=complete',
    );
  });

  it('confirms a completed onboarding with the way back', async () => {
    api['getSellerAccount'].mockReturnValue(
      of(account({ status: 'ACTIVE', payoutsEnabled: true, ready: true })),
    );
    await create({ onboarding: 'complete', returnTo: '/trades/t-1' });
    const done = element.querySelector('[data-testid="payouts-complete"]');
    expect(done?.textContent).toContain('Payouts are set up');
    expect(done?.querySelector('a')?.getAttribute('href')).toBe('/trades/t-1');
    expect(button('Set up payouts')).toBeUndefined();
  });

  it('ignores a return path outside the trades', async () => {
    api['getSellerAccount'].mockReturnValue(of(account({ status: 'ACTIVE', ready: true })));
    await create({ onboarding: 'complete', returnTo: '//evil.example' });
    expect(element.querySelector('[data-testid="payouts-complete"] a')).toBeNull();
  });

  it('says when payment protection is off', async () => {
    api['getSellerAccount'].mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 404, error: { errorCode: 'FEATURE_DISABLED' } }),
      ),
    );
    await create();
    expect(element.textContent).toContain('Payment protection is not available right now');
  });
});
