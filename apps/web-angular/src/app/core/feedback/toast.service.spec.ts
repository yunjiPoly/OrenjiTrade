import { TestBed } from '@angular/core/testing';
import { MAX_TOASTS, TOAST_MS, ToastService, UNDO_TOAST_MS, toastDuration } from './toast.service';
import { ToastSnackBar } from './toast-snack-bar';

describe('ToastService (spec 4.8)', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('stays 6 s, or 10 s with an Undo, unless the caller asks for longer', () => {
    expect(toastDuration(null)).toBe(TOAST_MS);
    expect(toastDuration('View')).toBe(6000);
    expect(toastDuration('Undo')).toBe(UNDO_TOAST_MS);
    expect(toastDuration(' undo ', 3000)).toBe(10000);
    expect(toastDuration(null, 8000)).toBe(8000);
    expect(toastDuration('View', 3000)).toBe(6000);
  });

  it('closes itself after its time and tells the caller', () => {
    const dismissed = vi.fn();
    service.show({ title: 'Saved' }).afterDismissed().subscribe(dismissed);
    expect(service.toasts().map((t) => t.title)).toEqual(['Saved']);
    vi.advanceTimersByTime(5999);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(service.toasts()).toHaveLength(0);
    expect(dismissed).toHaveBeenCalledWith({ dismissedByAction: false });
  });

  it('stacks up to three, closing the oldest for a fourth', () => {
    for (const title of ['One', 'Two', 'Three', 'Four']) {
      service.show({ title });
    }
    expect(MAX_TOASTS).toBe(3);
    expect(service.toasts().map((t) => t.title)).toEqual(['Two', 'Three', 'Four']);
  });

  it('runs its one action, then closes', () => {
    const acted = vi.fn();
    const dismissed = vi.fn();
    const ref = service.show({ title: 'Card deleted', action: 'Undo' });
    ref.onAction().subscribe(acted);
    ref.afterDismissed().subscribe(dismissed);
    service.act(service.toasts()[0].id);
    expect(acted).toHaveBeenCalledTimes(1);
    expect(dismissed).toHaveBeenCalledWith({ dismissedByAction: true });
    expect(service.toasts()).toHaveLength(0);
  });

  it('waits while the pointer or the focus is on the toasts', () => {
    service.show({ title: 'Saved' });
    vi.advanceTimersByTime(4000);
    service.pause();
    vi.advanceTimersByTime(30000);
    expect(service.toasts()).toHaveLength(1);
    service.resume();
    vi.advanceTimersByTime(1999);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(service.toasts()).toHaveLength(0);
  });

  it('turns every MatSnackBar call into a toast, errors in the error look', () => {
    const snackBar = TestBed.inject(ToastSnackBar);
    const acted = vi.fn();
    snackBar.open('Added to your wishlist', 'View', { duration: 4000 }).onAction().subscribe(acted);
    snackBar.open('The server is not answering', 'Retry later', {
      panelClass: 'app-toast--error',
    });
    expect(service.toasts().map((t) => [t.title, t.action, t.tone, t.duration])).toEqual([
      ['Added to your wishlist', 'View', 'success', 6000],
      ['The server is not answering', 'Retry later', 'error', 6000],
    ]);
    service.act(service.toasts()[0].id);
    expect(acted).toHaveBeenCalled();
    snackBar.dismiss();
    expect(service.toasts()).toHaveLength(0);
  });
});
