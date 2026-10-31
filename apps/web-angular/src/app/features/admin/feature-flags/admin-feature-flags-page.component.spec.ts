import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { AdminFeatureFlagsService, type FeatureFlag } from '@orenji/api-client';
import { of } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { AdminFeatureFlagsPageComponent } from './admin-feature-flags-page.component';

/** Spec 15.7 (board A18): a rollout is set only on a flag that is on and not locked (review fix 1). */
describe('AdminFeatureFlagsPageComponent (board A18)', () => {
  let fixture: ComponentFixture<AdminFeatureFlagsPageComponent>;
  let element: HTMLElement;
  let update: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;
  let show: ReturnType<typeof vi.fn>;
  let confirm: boolean;

  const flags: FeatureFlag[] = [
    { key: 'publicChat', enabled: true, rolloutPercent: 100, description: 'Rooms' },
    { key: 'cardTextScan', enabled: false, rolloutPercent: 100, description: 'Scan' },
    { key: 'mlScanning', enabled: true, rolloutPercent: 100, description: 'ML' },
  ] as FeatureFlag[];

  beforeEach(async () => {
    confirm = true;
    update = vi.fn(({ key, updateFeatureFlagRequest }) =>
      of({ ...flags.find((flag) => flag.key === key), ...updateFeatureFlagRequest }),
    );
    open = vi.fn(() => ({ afterClosed: () => of(confirm) }));
    show = vi.fn();
    await TestBed.configureTestingModule({
      imports: [AdminFeatureFlagsPageComponent],
      providers: [
        {
          provide: AdminFeatureFlagsService,
          useValue: { listFeatureFlags: vi.fn(() => of(flags)), updateFeatureFlag: update },
        },
        { provide: MatDialog, useValue: { open } },
        { provide: ToastService, useValue: { show } },
        { provide: FeatureFlagsService, useValue: { load: vi.fn(() => Promise.resolve()) } },
        { provide: SessionService, useValue: { isSuperAdmin: () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminFeatureFlagsPageComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const rollout = (key: string) => element.querySelector<HTMLInputElement>(`#ff-rollout-${key}`);

  it('offers a rollout only for a flag that is on and not locked', () => {
    expect(rollout('publicChat')).not.toBeNull();
    expect(rollout('cardTextScan')).toBeNull();
    expect(rollout('mlScanning')).toBeNull();
  });

  it('confirms a rollout by the flag’s name, then saves it', async () => {
    rollout('publicChat')!.value = '50';
    rollout('publicChat')!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    rollout('publicChat')!.form!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1].data.title).toBe('Roll Community rooms out to 50%?');
    expect(update).toHaveBeenCalledWith(
      {
        key: 'publicChat',
        updateFeatureFlagRequest: { enabled: true, rolloutPercent: 50, description: 'Rooms' },
      },
      'body',
      false,
      expect.anything(),
    );
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Community rooms rolls out to 50%.' }),
    );
  });

  it('saves nothing when the rollout is cancelled or out of range', async () => {
    confirm = false;
    rollout('publicChat')!.value = '40';
    rollout('publicChat')!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    rollout('publicChat')!.form!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(open).toHaveBeenCalledTimes(1);
    rollout('publicChat')!.value = '140';
    rollout('publicChat')!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    rollout('publicChat')!.form!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(open).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});
