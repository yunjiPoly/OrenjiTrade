import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { SAFETY_NOTICE_STORAGE_KEY, SafetyNoticeService } from './safety-notice.service';
import { TradingSafetyNoticeComponent } from './trading-safety-notice.component';

describe('TradingSafetyNoticeComponent', () => {
  let fixture: ComponentFixture<TradingSafetyNoticeComponent>;
  let element: HTMLElement;
  let me: ReturnType<typeof signal<{ id: string } | null>>;

  async function create(context: 'conversation' | 'trade'): Promise<void> {
    fixture = TestBed.createComponent(TradingSafetyNoticeComponent);
    fixture.componentRef.setInput('context', context);
    fixture.componentRef.setInput('otherName', 'Bea');
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  const notice = () => element.querySelector('[data-testid="safety-notice"]');

  beforeEach(() => {
    localStorage.clear();
    me = signal<{ id: string } | null>({ id: 'u-1' });
    TestBed.configureTestingModule({
      imports: [TradingSafetyNoticeComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: { me } }],
    });
  });

  afterEach(() => localStorage.clear());

  it('shows the advice with a link to the Trading safely page and Report / Block buttons', async () => {
    await create('conversation');
    expect(notice()?.getAttribute('role')).toBe('note');
    expect(notice()?.textContent).toContain('Trade safely');
    expect(notice()?.textContent).toContain('never share your home address');
    const link = element.querySelector<HTMLAnchorElement>('[data-testid="safety-guide"]');
    expect(link?.getAttribute('href')).toBe('/legal/trading-safely');

    const report = vi.fn();
    const block = vi.fn();
    fixture.componentInstance.reportRequested.subscribe(report);
    fixture.componentInstance.blockRequested.subscribe(block);
    element.querySelector<HTMLButtonElement>('button[aria-label="Report Bea"]')!.click();
    element.querySelector<HTMLButtonElement>('button[aria-label="Block Bea"]')!.click();
    expect(report).toHaveBeenCalledTimes(1);
    expect(block).toHaveBeenCalledTimes(1);
  });

  it('is dismissed once per user and context, and stays dismissed in this browser', async () => {
    await create('conversation');
    expect(notice()).not.toBeNull();
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Dismiss the safety notice"]')!
      .click();
    await fixture.whenStable();
    expect(notice()).toBeNull();
    const stored = JSON.parse(localStorage.getItem(SAFETY_NOTICE_STORAGE_KEY) ?? '{}');
    expect(stored['u-1'].conversation).toMatch(/^\d{4}-/);

    // A fresh component (new page load) reads the dismissal back.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TradingSafetyNoticeComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: { me } }],
    });
    await create('conversation');
    expect(notice()).toBeNull();

    // The trade context has its own dismissal; another collector sees the notice again.
    fixture.destroy();
    await create('trade');
    expect(notice()).not.toBeNull();
    expect(notice()?.getAttribute('data-context')).toBe('trade');
    me.set({ id: 'u-2' });
    fixture.destroy();
    await create('conversation');
    expect(notice()).not.toBeNull();
  });

  it('can hide the Report and Block buttons', async () => {
    fixture = TestBed.createComponent(TradingSafetyNoticeComponent);
    fixture.componentRef.setInput('context', 'trade');
    fixture.componentRef.setInput('showReport', false);
    fixture.componentRef.setInput('showBlock', false);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button[aria-label^="Report"]')).toBeNull();
    expect(element.querySelector('button[aria-label^="Block"]')).toBeNull();
    expect(element.querySelector('[data-testid="safety-guide"]')).not.toBeNull();
  });

  it('survives garbage or missing storage', () => {
    localStorage.setItem(SAFETY_NOTICE_STORAGE_KEY, '[not an object]');
    const service = TestBed.inject(SafetyNoticeService);
    expect(service.dismissed('trade')()).toBe(false);
    service.dismiss('trade');
    expect(service.dismissed('trade')()).toBe(true);
    expect(service.dismissed('conversation')()).toBe(false);
  });
});
