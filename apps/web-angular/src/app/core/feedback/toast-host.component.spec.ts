import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShellLayout } from '../layout/shell-layout.service';
import { ToastHostComponent } from './toast-host.component';
import { TOAST_MS, ToastService } from './toast.service';

describe('ToastHostComponent (spec 4.8)', () => {
  let service: ToastService;

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ToastHostComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    service = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('is a live region right under <body>, which a dialog never hides from screen readers', async () => {
    const host = await render();
    expect(host.parentElement).toBe(document.body);
    expect(host.getAttribute('aria-live')).toBe('polite');
  });

  it('rises above a bulk dock by its measured lift, and drops back without one (WD R1-3)', async () => {
    const host = await render();
    const layout = TestBed.inject(ShellLayout);
    const dock = document.createElement('div');
    document.body.appendChild(dock);
    vi.spyOn(dock, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight - 98,
    } as DOMRect);
    layout.trackDock(dock);
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(host.classList).toContain('toasts-host--dock');
    expect(host.style.getPropertyValue('--toasts-dock-lift')).toBe('110px');
    layout.trackDock(null);
    TestBed.tick();
    expect(host.classList).not.toContain('toasts-host--dock');
    expect(host.style.getPropertyValue('--toasts-dock-lift')).toBe('');
    dock.remove();
  });

  it('pauses the timers while the pointer is on the toasts, and resumes after', async () => {
    const host = await render();
    vi.useFakeTimers();
    service.show({ title: 'Renamed' });
    const stack = host.querySelector<HTMLElement>('.toasts')!;
    stack.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(service.toasts().length).toBe(1);
    stack.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(TOAST_MS + 1);
    expect(service.toasts().length).toBe(0);
  });

  it('moves the focus to the next toast, then back where it was, when a focused toast closes', async () => {
    const before = document.body.appendChild(document.createElement('button'));
    before.focus();
    const host = await render();
    service.show({ title: 'First' });
    service.show({ title: 'Second' });
    TestBed.tick();
    const closes = () => host.querySelectorAll<HTMLButtonElement>('.toast__close');
    const first = closes()[0];
    first.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: before }));
    first.focus();
    first.click();
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    expect(service.toasts().map((toast) => toast.title)).toEqual(['Second']);
    expect(document.activeElement).toBe(closes()[0]);
    closes()[0].click();
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.activeElement).toBe(before);
    before.remove();
  });
});
