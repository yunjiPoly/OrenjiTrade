import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GetStartedComponent } from './get-started.component';

describe('GetStartedComponent (spec 5.3, board W2)', () => {
  let fixture: ComponentFixture<GetStartedComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GetStartedComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(GetStartedComponent);
    fixture.componentRef.setInput('steps', {
      province: { state: 'done', place: 'Quebec, Canada' },
      card: false,
      wish: false,
      done: 1,
    });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows "1 of 3", the province done, Add cards (the one orange) and Add a wish', () => {
    const bar = element.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuetext')).toBe('1 of 3 done');
    expect(element.textContent).toContain('Quebec, Canada');
    const primary = element.querySelector('.gs__action--primary')!;
    expect(primary.textContent?.trim()).toBe('Add cards');
    expect(primary.getAttribute('href')).toBe('/inventory?add=new');
    expect(element.querySelector('a[href="/search?tab=wishlist"]')?.textContent?.trim()).toBe(
      'Add a wish',
    );
  });

  it('"Hide these steps" asks to hide them', () => {
    const hide = vi.fn();
    fixture.componentInstance.hide.subscribe(hide);
    const button = element.querySelector<HTMLButtonElement>('[data-testid="get-started-hide"]')!;
    expect(button.getAttribute('aria-label')).toBe('Hide these steps');
    button.click();
    expect(hide).toHaveBeenCalled();
  });
});
