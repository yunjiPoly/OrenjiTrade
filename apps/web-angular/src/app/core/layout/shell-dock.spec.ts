import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DOCK_TOAST_GAP, ShellLayout, dockLiftOf } from './shell-layout.service';

/** The toasts keep clear of a bulk dock as it is, measured (WD review U15 and R1-3). */
describe('ShellLayout: the toasts above a bulk dock', () => {
  it('lifts the toasts to the dock’s top plus the gap, and not at all for a dock out of view', () => {
    // 1024 x 768, a plain dock from 699: the toasts end 12 px above it.
    expect(dockLiftOf(768, 699)).toBe(69 + DOCK_TOAST_GAP);
    // The same dock with its error line, from 635: they end 12 px above that instead.
    expect(dockLiftOf(768, 635)).toBe(133 + DOCK_TOAST_GAP);
    expect(dockLiftOf(768, 800)).toBe(0);
  });

  it('follows the tracked dock as it grows, and drops the lift when it goes', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const layout = TestBed.inject(ShellLayout);
    const dock = document.createElement('div');
    document.body.appendChild(dock);
    let top = 699;
    vi.spyOn(dock, 'getBoundingClientRect').mockImplementation(
      () => ({ top, bottom: top + 68 }) as DOMRect,
    );
    expect(layout.dockOpen()).toBe(false);
    layout.trackDock(dock);
    expect(layout.dockLift()).toBe(window.innerHeight - 699 + DOCK_TOAST_GAP);
    expect(layout.dockOpen()).toBe(true);
    // The error line: the dock's top rises by 64 px.
    top = 635;
    layout.measureDock();
    expect(layout.dockLift()).toBe(window.innerHeight - 635 + DOCK_TOAST_GAP);
    layout.trackDock(null);
    expect(layout.dockLift()).toBe(0);
    expect(layout.dockOpen()).toBe(false);
    dock.remove();
  });
});
