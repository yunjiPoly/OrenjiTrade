import { Provider, signal } from '@angular/core';
import { GuestActions } from '../guest-actions.service';

/** The test runner's mock factory (`vi.fn`), passed in so this file builds with the app. */
type MockFactory = <T extends (...args: never[]) => unknown>(implementation?: T) => T;

/**
 * A stand-in for {@link GuestActions} in component tests: records the asks, takes nothing. Call
 * it with the runner's mock factory: `fakeGuestActions(vi.fn)`.
 */
export function fakeGuestActions(mock: MockFactory) {
  return {
    ask: mock(async (..._args: never[]) => undefined),
    ready: signal(false),
    pending: signal(null),
    opening: signal(false),
    take: mock((..._args: never[]) => null),
    forget: mock(() => undefined),
    start: mock(() => undefined),
  };
}

export function provideFakeGuestActions(fake: ReturnType<typeof fakeGuestActions>): Provider {
  return { provide: GuestActions, useValue: fake };
}
