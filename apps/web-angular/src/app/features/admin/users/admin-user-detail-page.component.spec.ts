import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { AdminUserDetail, AdminUsersService } from '@orenji/api-client';
import { of } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { FEATURE, FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminUserDetailPageComponent } from './admin-user-detail-page.component';
import { RolesEditorComponent } from './roles-editor.component';
import { UserModerationPanelComponent } from './user-moderation-panel.component';

/** The listing status card and moderation history read their own services: a stand-in here. */
@Component({ selector: 'app-user-moderation-panel', template: '' })
class ModerationPanelStub {
  readonly userId = input<string>();
  readonly handle = input<string>();
  readonly part = input<string>();
  readonly changed = output<void>();
  readonly status = signal<string | null>(null);
  readonly busy = signal(false);
  readonly load = vi.fn();
  readonly pause = vi.fn();
  readonly resume = vi.fn();
}

@Component({ selector: 'app-roles-editor', template: '' })
class RolesEditorStub {
  readonly roles = input<unknown>();
  readonly busy = input<boolean>();
  readonly isSelf = input<boolean>();
  readonly actorIsSuperAdmin = input<boolean>();
  readonly save = output<unknown>();
}

/**
 * The account page (board A8) applies `protectedPayments` to its Consents card (web stage WH2
 * review fix 2, R1-2): the helper `visibleConsents` is tested on its own; this checks the page
 * passes the flag.
 */
describe('AdminUserDetailPageComponent: consents (board A8)', () => {
  const detail = {
    account: {
      id: 'account-1',
      handle: 'ana.cards',
      displayName: 'Ana Cards',
      email: 'ana@example.test',
      emailVerified: true,
      status: 'ACTIVE',
      roles: new Set(['USER']),
      createdAt: '2026-09-01T12:00:00Z',
    },
    updatedAt: '2026-10-01T12:00:00Z',
    consents: [
      { documentType: 'TERMS', version: '3', acceptedAt: '2026-09-01T12:00:00Z' },
      { documentType: 'PAYMENT_PROTECTION', version: '1', acceptedAt: '2026-09-02T12:00:00Z' },
      { documentType: 'REFUND_DISPUTE', version: '1', acceptedAt: '2026-09-02T12:00:00Z' },
    ],
    recentAuditEntries: [],
  } as unknown as AdminUserDetail;

  async function render(paymentsOn: boolean): Promise<HTMLElement> {
    const flags = {
      enabled: vi.fn((key: string) =>
        signal(key === FEATURE.protectedPayments ? paymentsOn : false),
      ),
    };
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: { getUser: vi.fn(() => of(detail)) } },
        { provide: FeatureFlagsService, useValue: flags },
        {
          provide: SessionService,
          useValue: { me: signal({ id: 'staff-1' }), isSuperAdmin: () => true },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    })
      .overrideComponent(AdminUserDetailPageComponent, {
        remove: { imports: [UserModerationPanelComponent, RolesEditorComponent] },
        add: { imports: [ModerationPanelStub, RolesEditorStub] },
      })
      .compileComponents();
    const fixture: ComponentFixture<AdminUserDetailPageComponent> = TestBed.createComponent(
      AdminUserDetailPageComponent,
    );
    fixture.componentRef.setInput('id', 'account-1');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(flags.enabled).toHaveBeenCalledWith(FEATURE.protectedPayments);
    return fixture.nativeElement as HTMLElement;
  }

  const consentLines = (element: HTMLElement) =>
    element.querySelector('[aria-labelledby="detail-consents"]')?.textContent ?? '';

  it('lists no Payment Protection or Refund consent while protectedPayments is off', async () => {
    const lines = consentLines(await render(false));
    expect(lines).toContain('Terms of Service');
    expect(lines).not.toMatch(/Payment Protection/);
    expect(lines).not.toMatch(/Refund/);
  });

  it('lists them while protectedPayments is on', async () => {
    const lines = consentLines(await render(true));
    expect(lines).toContain('Terms of Service');
    expect(lines).toMatch(/Payment Protection/);
    expect(lines).toMatch(/Refund/);
  });
});
