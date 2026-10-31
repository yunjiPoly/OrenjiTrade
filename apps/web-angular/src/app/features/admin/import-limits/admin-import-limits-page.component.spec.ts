import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminConsoleService, AdminInventoryImportService } from '@orenji/api-client';
import { of } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminImportLimitsPageComponent } from './admin-import-limits-page.component';

describe('AdminImportLimitsPageComponent (board A15)', () => {
  let fixture: ComponentFixture<AdminImportLimitsPageComponent>;
  let element: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  const saved = {
    ydkMaxKb: 100,
    ydkMaxLines: 500,
    csvMaxKb: 2048,
    csvMaxRows: 5000,
    previewTtlMinutes: 60,
    updatedBy: 'id-of-alex',
    updatedAt: '2026-10-14T15:00:00Z',
    updatedByHandle: 'alex_m',
    updatedByName: 'Alex Morin',
  };

  beforeEach(async () => {
    api = {
      getAdminInventoryImportSettings: vi.fn(() => of(saved)),
      updateAdminInventoryImportSettings: vi.fn(({ updateInventoryImportSettingsRequest }) =>
        of({ ...saved, ...updateInventoryImportSettingsRequest }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [AdminImportLimitsPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminInventoryImportService, useValue: api },
        {
          provide: AdminConsoleService,
          useValue: {
            getSystemHealth: vi.fn(() =>
              of({
                jobs: [
                  {
                    name: 'inventory-import-purge',
                    lastStatus: 'SUCCEEDED',
                    lastStartedAt: '2026-10-31T14:00:00Z',
                    failuresLast24h: 0,
                  },
                ],
              }),
            ),
          },
        },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminImportLimitsPageComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const input = (key: string) => element.querySelector<HTMLInputElement>(`#il-${key}`)!;
  const save = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Save limits'),
    )!;

  it('names who changed the limits and what collectors read, never an id', () => {
    expect(element.textContent).toContain('Last changed Oct 14 by Alex Morin');
    expect(element.textContent).not.toContain('id-of-alex');
    expect(element.textContent).toContain('Up to 100 kB and 500 lines');
    expect(element.textContent).toContain('Up to 2 MB and 5,000 rows');
    expect(element.textContent).toContain('Import clean-up');
    expect(element.textContent).toContain('Succeeded');
  });

  it('refuses a value out of range with the field described, and sends nothing', async () => {
    input('csvMaxRows').value = '9';
    input('csvMaxRows').dispatchEvent(new Event('input'));
    await fixture.whenStable();
    save().click();
    await fixture.whenStable();
    expect(api['updateAdminInventoryImportSettings']).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Use 10 to 20,000 rows.');
    expect(input('csvMaxRows').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input('csvMaxRows'));
  });

  it('saves only what changed and updates the preview as typed', async () => {
    input('ydkMaxLines').value = '600';
    input('ydkMaxLines').dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.textContent).toContain('Up to 100 kB and 600 lines');
    save().click();
    await fixture.whenStable();
    expect(api['updateAdminInventoryImportSettings']).toHaveBeenCalledWith(
      { updateInventoryImportSettingsRequest: { ydkMaxLines: 600 } },
      'body',
      false,
      expect.anything(),
    );
  });
});
