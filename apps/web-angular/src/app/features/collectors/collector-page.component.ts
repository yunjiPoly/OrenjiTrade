import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import {
  CollectorProfileResponse,
  CollectorsService,
  PublicBinderSummary,
  PublicBindersService,
  PublicInventoryItem,
  WishlistService,
  WishlistSummaryEntry,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { ConversationStarterService } from '../../shared/messaging/conversation-starter.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { CollectorProfileViewComponent } from './collector-profile-view/collector-profile-view.component';

/** Public cards shown on the profile (the rest are in the binders). */
const PUBLIC_ITEMS_PREVIEW = 8;

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: CollectorProfileResponse }
  | { kind: 'members-only' }
  | { kind: 'not-found' }
  | { kind: 'error'; error: ApiError };

/**
 * `/collectors/:handle`: public collector profile (`GET /api/v1/collectors/{handle}`).
 * Members only: signed-out visitors are invited to sign in. 404 covers unknown, private,
 * suspended and deleted collectors alike, so nothing leaks about why.
 */
@Component({
  selector: 'app-collector-page',
  imports: [
    RouterLink,
    MatButtonModule,
    CollectorProfileViewComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="page">
      @switch (state().kind) {
        @case ('loading') {
          <div class="collector-skeleton" aria-busy="true">
            <span class="visually-hidden">Loading the collector profile</span>
            <app-skeleton height="132px" />
            <app-skeleton variant="list" lines="2" />
            <app-skeleton height="200px" />
          </div>
        }
        @case ('members-only') {
          <app-empty-state
            icon="lock_person"
            title="Collector profiles are for members"
            description="Sign in or create a free account to see who trades near you."
          >
            <a actions matButton="filled" routerLink="/auth/sign-in" [queryParams]="{ returnUrl }">
              Sign in
            </a>
            <a
              actions
              matButton="outlined"
              routerLink="/auth/sign-up"
              [queryParams]="{ returnUrl }"
            >
              Create account
            </a>
          </app-empty-state>
        }
        @case ('not-found') {
          <app-empty-state
            icon="person_off"
            title="This collector is not available"
            description="The profile does not exist, is private, or is no longer active."
          >
            <a actions matButton="filled" routerLink="/map">Back to the map</a>
          </app-empty-state>
        }
        @case ('error') {
          <app-error-state
            title="We could not load this profile"
            [message]="errorMessage()"
            [requestId]="errorRequestId()"
            (retry)="load()"
          />
        }
        @case ('ready') {
          @if (profile(); as profile) {
            <app-collector-profile-view
              [profile]="profile"
              [isOwn]="isOwn()"
              [binders]="binders()"
              [bindersFailed]="bindersFailed()"
              [publicItems]="publicItems()"
              [publicItemCount]="publicItemCount()"
              [wishlist]="wishlist()"
              [messaging]="starter.starting() === profile.id"
              (retryBinders)="loadListings(profile.handle)"
              (messageRequested)="openConversation(profile.id)"
            />
          }
        }
      }
    </div>
  `,
  styles: `
    .collector-skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorPageComponent {
  private readonly collectorsApi = inject(CollectorsService);
  private readonly bindersApi = inject(PublicBindersService);
  private readonly wishlistApi = inject(WishlistService);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly starter = inject(ConversationStarterService);

  /** Bound from the `:handle` route parameter. */
  readonly handle = input.required<string>();

  protected readonly state = signal<ViewState>({ kind: 'loading' });
  /** Public binders of the collector (`null` while loading). */
  protected readonly binders = signal<PublicBinderSummary[] | null>(null);
  protected readonly bindersFailed = signal(false);
  /** First public cards across binders (`null` while loading). */
  protected readonly publicItems = signal<PublicInventoryItem[] | null>(null);
  protected readonly publicItemCount = signal(0);
  /** Public wishlist (Phase 6): `null` while loading, empty when hidden (404) or empty. */
  protected readonly wishlist = signal<WishlistSummaryEntry[] | null>(null);
  protected readonly profile = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.profile : null;
  });
  protected readonly isOwn = computed(() => {
    const profile = this.profile();
    const me = this.session.me();
    return !!profile && !!me && profile.id === me.id;
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? friendlyMessage(state.error) : '';
  });
  protected readonly errorRequestId = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.error.requestId : null;
  });
  protected get returnUrl(): string {
    return this.router.url;
  }

  private subscription: Subscription | null = null;
  private listingsSubscription: Subscription | null = null;

  constructor() {
    effect(() => {
      this.handle();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.unsubscribe();
      this.listingsSubscription?.unsubscribe();
    });
  }

  /** "Message": open (or start) the conversation on the Messages page. */
  protected async openConversation(recipientId: string): Promise<void> {
    const conversation = await this.starter.start(recipientId);
    if (conversation) {
      void this.router.navigate(['/messages', conversation.id]);
    }
  }

  /** Public binders, a preview of the public cards (Phase 3) and the public wishlist (Phase 6). */
  protected loadListings(handle: string): void {
    this.listingsSubscription?.unsubscribe();
    this.binders.set(null);
    this.bindersFailed.set(false);
    this.publicItems.set(null);
    this.wishlist.set(null);
    this.listingsSubscription = new Subscription();
    this.listingsSubscription.add(
      this.wishlistApi
        .getCollectorWishlist({ handle }, 'body', false, { context: silentErrors() })
        .subscribe({
          next: (entries) => this.wishlist.set(entries ?? []),
          // 404: the collector does not show their wishlist (or it is not visible to the caller).
          error: () => this.wishlist.set([]),
        }),
    );
    this.listingsSubscription.add(
      this.bindersApi
        .listCollectorBinders({ handle }, 'body', false, { context: silentErrors() })
        .subscribe({
          next: (binders) => this.binders.set(binders ?? []),
          error: () => {
            this.binders.set([]);
            this.bindersFailed.set(true);
          },
        }),
    );
    this.listingsSubscription.add(
      this.bindersApi
        .listCollectorInventory({ handle, size: PUBLIC_ITEMS_PREVIEW }, 'body', false, {
          context: silentErrors(),
        })
        .subscribe({
          next: (page) => {
            this.publicItems.set(page.items ?? []);
            this.publicItemCount.set(page.totalItems ?? 0);
          },
          error: () => this.publicItems.set([]),
        }),
    );
  }

  protected async load(): Promise<void> {
    this.subscription?.unsubscribe();
    this.state.set({ kind: 'loading' });
    await this.auth.ready();
    if (!this.auth.isAuthenticated()) {
      this.state.set({ kind: 'members-only' });
      return;
    }
    this.subscription = this.collectorsApi
      .getCollector({ handle: this.handle() }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (profile) => {
          this.state.set({ kind: 'ready', profile });
          this.loadListings(profile.handle);
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          if (apiError.status === 404) {
            this.state.set({ kind: 'not-found' });
          } else if (apiError.status === 401) {
            this.state.set({ kind: 'members-only' });
          } else {
            this.state.set({ kind: 'error', error: apiError });
          }
        },
      });
  }
}
