import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { GuestPageComponent, GuestPageKind } from './guest-page.component';

@Component({ template: '' })
class Blank {}

describe('GuestPageComponent: Inventory, Messages and Profile for a guest (spec 14)', () => {
  async function render(kind: GuestPageKind, url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [GuestPageComponent],
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(GuestPageComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('Messages: "Talk to collectors", and both buttons come back to the very page (U13)', async () => {
    const element = await render('messages', '/messages/community/americas-north-yugioh');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Talk to collectors');
    const links = [...element.querySelectorAll('a')].map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);
    const back = encodeURIComponent('/messages/community/americas-north-yugioh');
    expect(links).toEqual([
      ['Create account', `/auth/sign-up?returnUrl=${back}`],
      ['Sign in', `/auth/sign-in?returnUrl=${back}`],
    ]);
  });

  it('Inventory: "Your cards, in one place"; Profile lists Appearance, Trading safely, Legal', async () => {
    let element = await render('inventory', '/inventory');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Your cards, in one place');
    expect(element.querySelector('.guest__rows')).toBeNull();
    TestBed.resetTestingModule();
    element = await render('profile', '/profile');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Your collector profile');
    const rows = [...element.querySelectorAll('.guest__row')].map((a) => a.getAttribute('href'));
    expect(rows).toEqual(['/settings/appearance', '/legal/trading-safely', '/legal']);
  });
});
