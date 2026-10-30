import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { GuestPageComponent } from '../../shared/guest/guest-page.component';
import { CollectorPageComponent } from '../collectors/collector-page.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';

/**
 * `/profile`: your own profile, the rail's Profile (spec 4.6 and 4.11; board W23b): the collector
 * page of your handle (the welcome sets it). A guest reads Profile's guest page instead (spec 14),
 * with Appearance, Trading safely and Legal.
 */
@Component({
  selector: 'app-my-profile-page',
  imports: [
    RouterLink,
    CollectorPageComponent,
    EmptyStateComponent,
    GuestPageComponent,
    SkeletonComponent,
  ],
  template: `
    @if (!auth.isAuthenticated()) {
      <app-guest-page kind="profile" />
    } @else if (session.handle(); as handle) {
      <app-collector-page [handle]="handle" />
    } @else if (session.status() === 'ready') {
      <div class="page">
        <app-empty-state
          icon="person"
          title="Your profile has no handle yet"
          description="Choose a handle in Settings to get a public profile."
        >
          <a actions routerLink="/settings/profile">Open Settings</a>
        </app-empty-state>
      </div>
    } @else {
      <div class="page" aria-busy="true">
        <span class="visually-hidden">Loading your profile</span>
        <app-skeleton variant="list" lines="4" />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyProfilePageComponent {
  protected readonly session = inject(SessionService);
  protected readonly auth = inject(AuthService);
}
