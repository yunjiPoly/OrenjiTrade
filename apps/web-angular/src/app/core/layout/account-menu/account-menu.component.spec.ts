import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import { KeyboardShortcuts } from '../../keyboard/keyboard-shortcuts.service';
import { ThemeService } from '../../theme/theme.service';
import { AccountMenuComponent } from './account-menu.component';

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('AccountMenuComponent (spec 4.7, board W3)', () => {
  let fixture: ComponentFixture<AccountMenuComponent>;
  const canAccessAdmin = signal(false);
  let signOut: ReturnType<typeof vi.fn>;
  let openHelp: ReturnType<typeof vi.fn>;

  afterEach(() =>
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => (node.innerHTML = '')),
  );

  beforeEach(async () => {
    canAccessAdmin.set(false);
    signOut = vi.fn(async () => undefined);
    openHelp = vi.fn();
    await TestBed.configureTestingModule({
      imports: [AccountMenuComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { signOut } },
        {
          provide: SessionService,
          useValue: {
            me: signal({ avatarUrl: null }),
            displayName: signal('Sam Tremblay'),
            handle: signal('sam_trades'),
            canAccessAdmin,
          },
        },
        { provide: KeyboardShortcuts, useValue: { openHelp } },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AccountMenuComponent);
    await settle(fixture);
  });

  async function open(): Promise<HTMLElement[]> {
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="account-menu-trigger"]')!
      .click();
    await settle(fixture);
    return Array.from(document.querySelectorAll<HTMLElement>('.account-menu [mat-menu-item]'));
  }

  it('names the avatar and lists the items, with no Offers, Trades or Payouts', async () => {
    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="account-menu-trigger"]',
    );
    expect(trigger?.getAttribute('aria-label')).toBe('Account menu, Sam Tremblay');
    const items = await open();
    expect(document.querySelector('[data-testid="account-menu-name"]')?.textContent).toBe(
      'Sam Tremblay',
    );
    expect(document.querySelector('[data-testid="account-menu-handle"]')?.textContent).toBe(
      '@sam_trades',
    );
    expect(
      items.map((item) => item.textContent?.replace(/\s+/g, ' ').replace('?', '').trim()),
    ).toEqual([
      'View my profile',
      'Settings',
      'Appearance',
      'Keyboard shortcuts',
      'Trading safely',
      'Sign out',
    ]);
    expect(document.body.textContent).not.toMatch(/Offers|Trades|Payouts/);
    expect(items[0].getAttribute('href')).toBe('/profile');
    expect(items[4].getAttribute('href')).toBe('/legal/trading-safely');
  });

  it('adds Admin console for staff, and opens the shortcuts', async () => {
    canAccessAdmin.set(true);
    await settle(fixture);
    const items = await open();
    const admin = items.find((item) => item.textContent?.includes('Admin console'));
    expect(admin?.getAttribute('href')).toBe('/admin');
    items.find((item) => item.textContent?.includes('Keyboard shortcuts'))!.click();
    expect(openHelp).toHaveBeenCalled();
  });

  it('chooses the theme in Appearance ›, and signs out to Home', async () => {
    const items = await open();
    items.find((item) => item.textContent?.includes('Appearance'))!.click();
    await settle(fixture);
    const radios = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    expect(radios.map((r) => r.textContent?.trim())).toEqual([
      'Same as the system',
      'Light',
      'Dark',
    ]);
    radios[2].click();
    expect(TestBed.inject(ThemeService).preference()).toBe('dark');
    TestBed.inject(ThemeService).setPreference('system');
    const again = await open();
    again.find((item) => item.textContent?.includes('Sign out'))!.click();
    await settle(fixture);
    expect(signOut).toHaveBeenCalled();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/');
  });
});
