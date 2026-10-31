import { TestBed } from '@angular/core/testing';
import { ShippingSettingsComponent } from './shipping-settings.component';

describe('Settings › Shipping details on the web (spec 13, decision 9)', () => {
  it('says the web saves no address or e-Transfer email, and has nothing to fill in', async () => {
    const fixture = TestBed.createComponent(ShippingSettingsComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain(
      "On the web, OrenjiTrade doesn't save your address or e-Transfer email. Type them in the chat when you need them, with + › Send my address. The phone app can keep them on that phone only.",
    );
    expect(element.querySelectorAll('input, textarea, select')).toHaveLength(0);
  });
});
