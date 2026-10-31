import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RoomRulesComponent } from './room-rules.component';

describe('RoomRulesComponent (web WF, leftover F10)', () => {
  function render(blocked: { id: string; handle: string }[] = []) {
    TestBed.configureTestingModule({
      imports: [RoomRulesComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(RoomRulesComponent);
    fixture.componentRef.setInput('blocked', blocked);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says where every block is listed, with a link to Settings › Blocked', () => {
    const element = render();
    const line = element.querySelector('[data-testid="room-rules-blocked-where"]');
    expect(line?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Everyone you blocked is in Settings › Blocked, where you can unblock them.',
    );
    expect(line?.querySelector('a')?.getAttribute('href')).toBe('/settings/blocked');
  });

  it('lists the collectors blocked from this page with Unblock', () => {
    const element = render([{ id: 'u1', handle: 'maya' }]);
    expect(element.textContent).toContain('You blocked maya');
    expect(element.querySelector('.rr__unblock')?.getAttribute('aria-label')).toBe('Unblock maya');
  });
});
