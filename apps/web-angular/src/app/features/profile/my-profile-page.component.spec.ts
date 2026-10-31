import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { CollectorPageComponent } from '../collectors/collector-page.component';
import { MyProfilePageComponent } from './my-profile-page.component';

@Component({ selector: 'app-collector-page', template: 'profile of {{ handle() }}' })
class FakeCollectorPage {
  readonly handle = input('');
}

describe('MyProfilePageComponent (/profile)', () => {
  function render(authenticated: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [MyProfilePageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: signal(authenticated) } },
        {
          provide: SessionService,
          useValue: { handle: signal(authenticated ? 'sam' : null), status: signal('ready') },
        },
      ],
    });
    TestBed.overrideComponent(MyProfilePageComponent, {
      remove: { imports: [CollectorPageComponent] },
      add: { imports: [FakeCollectorPage] },
    });
    const fixture = TestBed.createComponent(MyProfilePageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("a guest reads Profile's guest page (spec 14)", () => {
    const element = render(false);
    expect(element.querySelector('[data-testid="guest-page-profile"]')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Your collector profile');
  });

  it('a collector reads their own profile', () => {
    expect(render(true).textContent).toContain('profile of sam');
  });
});
