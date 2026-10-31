import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LimitReachedInfo } from './limit-reached';
import { LimitReachedDialogComponent } from './limit-reached-dialog.component';

function info(overrides: Partial<LimitReachedInfo> = {}): LimitReachedInfo {
  return {
    limitKey: 'binder.views.per_day',
    limit: 30,
    used: 30,
    resetsAt: '2099-01-01T00:00:00Z',
    requestId: 'req-1',
    ...overrides,
  };
}

describe('LimitReachedDialogComponent', () => {
  let fixture: ComponentFixture<LimitReachedDialogComponent>;

  async function render(data: LimitReachedInfo): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [LimitReachedDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(LimitReachedDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('explains the limit, the usage and the reset, with nothing to buy', async () => {
    const element = await render(info());
    const text = element.textContent ?? '';
    expect(element.querySelector('[data-testid="limit-summary"]')?.textContent).toContain(
      'Public binder views per day',
    );
    expect(text).toContain('you used 30 of 30 today');
    // Collectors read the limit's name, never its technical key.
    expect(text).not.toContain('binder.views.per_day');
    expect(element.querySelector('[data-testid="limit-reset"]')?.textContent).toMatch(/in \d+/);
    expect(element.querySelector('[data-testid="limit-note"]')?.textContent).toContain(
      'Every collector has the same limits.',
    );
    // No plan, no Premium, no link anywhere.
    expect(text).not.toMatch(/premium|plan/i);
    expect(element.querySelector('a')).toBeNull();
  });

  it('explains totals that never reset', async () => {
    const element = await render(
      info({ limitKey: 'wishlist.items.max', limit: 20, used: 20, resetsAt: null }),
    );
    const text = element.textContent ?? '';
    expect(text).toContain('Wishlist items');
    expect(text).toContain('you used 20 of 20 on your account');
    expect(text).toContain('Does not reset on its own');
  });
});
