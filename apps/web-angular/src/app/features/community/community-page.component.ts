import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { CreatePostRequest } from '@orenji/api-client';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { RegionContext } from '../../core/region/region-context.service';
import { PLATFORM_REGION_NAMES } from '../../shared/regions/regions.store';
import { GameChipComponent } from '../../shared/ui/game-chip/game-chip.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { ChannelSidebarComponent } from './channel-sidebar/channel-sidebar.component';
import { channelIcon, defaultChannel } from './data/community-helpers';
import { CommunityStore } from './data/community.store';
import { PostComposerComponent } from './post-composer/post-composer.component';
import { PostItemComponent } from './post-item/post-item.component';

/**
 * `/community` and `/community/:slug` (behind the `publicChat` flag): channel sidebar, the channel
 * header, the post composer and the feed with inline replies. Container of {@link CommunityStore}.
 */
@Component({
  selector: 'app-community-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ChannelSidebarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameChipComponent,
    PostComposerComponent,
    PostItemComponent,
    SkeletonComponent,
  ],
  providers: [CommunityStore],
  templateUrl: './community-page.component.html',
  styleUrl: './community-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityPageComponent {
  protected readonly store = inject(CommunityStore);
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly region = inject(RegionContext);
  private readonly snackBar = inject(MatSnackBar);
  private readonly composer = viewChild(PostComposerComponent);

  /** `:slug` route parameter (withComponentInputBinding). */
  readonly slug = input<string | undefined>();

  protected readonly postError = signal<string | null>(null);
  /** Narrow screens: the channel list replaces the feed while open. */
  protected readonly channelsOpen = signal(false);
  protected readonly channelIcon = channelIcon;
  /** "Europe" for a region channel's code; an archived city channel keeps its city label. */
  protected readonly regionName = (label: string): string => PLATFORM_REGION_NAMES[label] ?? label;
  protected readonly channelsErrorMessage = computed(() => {
    const error = this.store.channelsError();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly postsErrorMessage = computed(() => {
    const error = this.store.postsError();
    return error ? friendlyMessage(error) : '';
  });
  private channelsLoaded = false;

  constructor() {
    effect(() => {
      const slug = this.slug();
      untracked(() => void this.show(slug ?? null));
    });
  }

  protected async retryChannels(): Promise<void> {
    this.channelsLoaded = false;
    await this.show(this.slug() ?? null);
  }

  protected async onPost(request: CreatePostRequest): Promise<void> {
    this.postError.set(null);
    const problem = await this.store.createPost(request);
    if (problem) {
      this.postError.set(problem);
      return;
    }
    this.composer()?.reset();
    this.snackBar.open('Posted.', 'OK', { duration: 3000 });
  }

  private async show(slug: string | null): Promise<void> {
    this.postError.set(null);
    this.channelsOpen.set(false);
    await this.auth.ready();
    if (!this.auth.isAuthenticated()) {
      return;
    }
    let fallback: string | null;
    if (this.channelsLoaded) {
      fallback = defaultChannel(this.store.channels(), this.region.current())?.slug ?? null;
    } else {
      fallback = await this.store.loadChannels();
      this.channelsLoaded = this.store.channelsStatus() === 'ready';
    }
    if (this.store.channelsStatus() !== 'ready') {
      return;
    }
    if (!slug) {
      if (fallback) {
        void this.router.navigate(['/community', fallback], { replaceUrl: true });
      }
      return;
    }
    this.store.select(slug);
  }
}
