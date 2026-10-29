import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { CollectorPageComponent } from '../collectors/collector-page.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';

/**
 * `/profile`: your own profile, the rail's Profile (spec 4.6 and 4.11). Until web stage WE
 * redesigns it (W23b), it is today's collector page for your handle; the account must have a
 * handle (the welcome sets it).
 */
@Component({
  selector: 'app-my-profile-page',
  imports: [RouterLink, CollectorPageComponent, EmptyStateComponent, SkeletonComponent],
  template: `
    @if (session.handle(); as handle) {
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
}
