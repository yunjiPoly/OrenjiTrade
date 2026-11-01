import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Route, Router, UrlTree, provideRouter } from '@angular/router';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ADMIN_ROUTES, PAYMENT_PATHS, paymentsGuard } from './admin.routes';

describe('the console routes (review fix 1, F3)', () => {
  const children = ADMIN_ROUTES[0].children as Route[];

  it('guards every page of the PAYMENTS group with the protectedPayments flag', () => {
    for (const path of PAYMENT_PATHS) {
      const route = children.find((child) => child.path === path);
      expect(route, path).toBeDefined();
      expect(route?.canActivate, path).toContain(paymentsGuard);
    }
    const guarded = children
      .filter((child) => child.canActivate?.includes(paymentsGuard))
      .map((child) => child.path);
    expect(guarded.sort()).toEqual([...PAYMENT_PATHS].sort());
  });

  it('sends a typed address to the Overview while the flag is off, and lets it in when on', async () => {
    const open = vi.fn();
    const values: Record<string, boolean> = { protectedPayments: false };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MatSnackBar, useValue: { open } },
        {
          provide: FeatureFlagsService,
          useValue: {
            whenLoaded: () => Promise.resolve(),
            isEnabled: (key: string) => values[key] === true,
          },
        },
      ],
    });

    const denied = await TestBed.runInInjectionContext(() =>
      paymentsGuard(undefined as never, undefined as never),
    );
    expect(denied instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(denied as UrlTree)).toBe('/admin');
    expect(open).toHaveBeenCalledWith(
      'Protected payments is not available right now.',
      'OK',
      expect.anything(),
    );

    values['protectedPayments'] = true;
    const allowed = await TestBed.runInInjectionContext(() =>
      paymentsGuard(undefined as never, undefined as never),
    );
    expect(allowed).toBe(true);
  });
});
