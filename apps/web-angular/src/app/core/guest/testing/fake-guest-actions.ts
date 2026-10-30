import { Provider, signal } from '@angular/core';
import { GuestActions } from '../guest-actions.service';

/** A stand-in for {@link GuestActions} in component tests: records the asks, takes nothing. */
export function fakeGuestActions() {
  return {
    ask: vi.fn(async () => undefined),
    ready: signal(false),
    pending: signal(null),
    opening: signal(false),
    take: vi.fn(() => null),
    forget: vi.fn(),
    start: vi.fn(),
  };
}

export function provideFakeGuestActions(fake = fakeGuestActions()): Provider {
  return { provide: GuestActions, useValue: fake };
}
