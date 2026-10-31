import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';
import { HandleAvailabilityResponse, ProfileService, TagResponse } from '@orenji/api-client';
import { Subscription, startWith } from 'rxjs';
import { safeReturnUrl } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { ToastService } from '../../core/feedback/toast.service';
import { GameContext } from '../../core/game/game-context.service';
import { ApiError, isApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import { GamesStore } from '../../shared/catalog/games.store';
import { LocationFieldsComponent } from '../../shared/location/location-fields/location-fields.component';
import {
  LocationDraft,
  MyLocationStore,
  draftOf,
  isCompleteDraft,
} from '../../shared/location/my-location.store';
import { LanguagePickerComponent } from '../../shared/profile/language-picker/language-picker.component';
import { MyProfileStore, splitTags } from '../../shared/profile/my-profile.store';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  HANDLE_MAX,
  HANDLE_MIN,
  HANDLE_PATTERN,
  applyProfileServerErrors,
  createProfileForm,
  patchProfileForm,
  profileRequest,
} from '../../shared/profile/profile-form';
import { TagPickerComponent } from '../../shared/profile/tag-picker/tag-picker.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { WELCOME_COPY } from './welcome-copy';
import { WelcomeGameTilesComponent } from './welcome-game-tiles.component';
import {
  WELCOME_STEPS,
  WelcomeStep,
  firstWelcomeStep,
  handleCheckState,
  openingGame,
  previousWelcomeStep,
  welcomeDisplayName,
  welcomeGames,
  welcomeStepNumber,
} from './welcome-rules';

type Busy = 'profile' | 'interests' | 'location' | null;

/** How long the handle's live check waits after the last key (ms). */
export const HANDLE_CHECK_DELAY_MS = 400;

/**
 * `/onboarding`, the welcome (spec 14; the phone's R12 screens 40 to 42): a centred 560 card,
 * "Step n of 3" with a 3-part bar, Back and Continue (52):
 * 1. "Who are you?": the handle with a live check ("@sam_trades is free",
 *    `GET /me/profile/handle-availability`), the display name (the one typed at sign-up when the
 *    account still has its first one) and an optional bio;
 * 2. "What do you collect?": the five games as 96 tiles, "Opens first" on the first one picked
 *    that can be browsed, coming-soon games dimmed; the languages and tags as before;
 * 3. "Where do you ship from?": "We never use GPS and never ask for your address.", country,
 *    state or province and an optional city, "Show me on the map" (off by default).
 * Finishing opens the first picked game and goes to Home, or back to the page the visitor came
 * from (a guest's pending action finishes there). The 18+ confirmation is asked at sign-up or on
 * Review our terms, never here.
 */
@Component({
  selector: 'app-onboarding-page',
  imports: [
    ReactiveFormsModule,
    MatSlideToggleModule,
    ShellIconComponent,
    WelcomeGameTilesComponent,
    LanguagePickerComponent,
    TagPickerComponent,
    LocationFieldsComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './onboarding-page.component.html',
  styleUrls: ['../auth/auth-form.scss', './onboarding-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly profiles = inject(MyProfileStore);
  private readonly locations = inject(MyLocationStore);
  private readonly profileApi = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly gameContext = inject(GameContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly gamesStore = inject(GamesStore);
  protected readonly session = inject(SessionService);

  readonly returnUrl = input<string | undefined>();

  protected readonly copy = WELCOME_COPY;
  protected readonly steps = WELCOME_STEPS;
  protected readonly handleMax = HANDLE_MAX;
  protected readonly nameMax = DISPLAY_NAME_MAX;
  protected readonly bioMax = BIO_MAX;

  protected readonly form = createProfileForm(this.fb);
  protected readonly games = signal<string[]>([]);
  protected readonly languages = signal<string[]>([]);
  protected readonly tags = signal<TagResponse[]>([]);
  protected readonly customTags = signal<string[]>([]);
  protected readonly location = signal<LocationDraft | null>(null);
  protected readonly locationSubmitted = signal(false);
  protected readonly discoverable = signal(false);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly busy = signal<Busy>(null);
  protected readonly stepError = signal<string | null>(null);
  protected readonly step = signal<WelcomeStep>('profile');
  protected readonly stepNumber = computed(() => welcomeStepNumber(this.step()));
  protected readonly profileSubmitted = signal(false);
  protected readonly interestsInvalid = signal(false);
  protected readonly hasInterests = computed(
    () => this.games().length > 0 || this.tags().length > 0 || this.customTags().length > 0,
  );
  protected readonly gameTiles = computed(() => welcomeGames(this.gamesStore.games()));

  // The handle's live check (spec 14: "@sam_trades is free").
  private readonly typed = signal('');
  /** The handle the last check asked for (the typed one once typing paused). */
  protected readonly settled = signal('');
  private readonly answer = signal<HandleAvailabilityResponse | null>(null);
  private readonly checking = signal(false);
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private checkRequest: Subscription | null = null;
  protected readonly check = computed(() =>
    handleCheckState({
      typed: this.typed(),
      settled: this.settled(),
      answer: this.answer(),
      checking: this.checking(),
    }),
  );
  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(null)));
  /** The handle's format message, after a Continue or once the field was left. */
  protected readonly handleError = computed(() => {
    this.formValue();
    this.profileSubmitted();
    const handle = this.form.controls.handle;
    if (!handle.invalid || !(handle.touched || this.profileSubmitted())) {
      return null;
    }
    if (handle.hasError('required')) {
      return 'Choose a handle.';
    }
    if (handle.hasError('taken')) {
      return WELCOME_COPY.profile.taken;
    }
    if (handle.hasError('minlength')) {
      return `Use at least ${HANDLE_MIN} characters.`;
    }
    if (handle.hasError('pattern')) {
      return 'Only lowercase letters, digits and underscores.';
    }
    return (handle.getError('server') as string | undefined) ?? null;
  });
  protected readonly nameError = computed(() => {
    this.formValue();
    this.profileSubmitted();
    const name = this.form.controls.displayName;
    if (!name.invalid || !(name.touched || this.profileSubmitted())) {
      return null;
    }
    return name.hasError('required')
      ? 'Enter a display name.'
      : ((name.getError('server') as string | undefined) ?? null);
  });
  protected readonly bioError = computed(() => {
    this.formValue();
    return (this.form.controls.bio.getError('server') as string | undefined) ?? null;
  });

  constructor() {
    void this.load();
    void this.gamesStore.load();
    inject(DestroyRef).onDestroy(() => {
      if (this.checkTimer) {
        clearTimeout(this.checkTimer);
      }
      this.checkRequest?.unsubscribe();
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const [profile, locationOk] = await Promise.all([this.profiles.load(), this.locations.load()]);
    if (!profile || !locationOk) {
      this.loadError.set(this.profiles.error() ?? this.locations.error());
      this.loading.set(false);
      return;
    }
    patchProfileForm(this.form, profile);
    // The name typed at sign-up, when the account was made before it reached the API.
    this.form.controls.displayName.setValue(
      welcomeDisplayName(profile.displayName, profile.handle, this.auth.user()?.displayName),
    );
    this.typed.set(this.form.controls.handle.value);
    this.games.set(profile.games);
    this.languages.set(profile.languages);
    const { curated, custom } = splitTags(profile.tags);
    this.tags.set(curated);
    this.customTags.set(custom);
    this.step.set(firstWelcomeStep(this.session.me()?.onboarding));
    this.location.set(draftOf(this.locations.location()));
    this.discoverable.set(this.locations.privacy()?.discoverable ?? false);
    this.loading.set(false);
    this.askHandle(this.form.controls.handle.value);
  }

  protected reloadGames(): void {
    void this.gamesStore.load(true);
  }

  /** The handle is typed lower-case; the live check waits for a pause. */
  protected onHandleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const lower = target.value.toLowerCase();
    if (lower !== target.value) {
      this.form.controls.handle.setValue(lower);
    }
    this.typed.set(lower);
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }
    this.checkTimer = setTimeout(() => this.askHandle(lower), HANDLE_CHECK_DELAY_MS);
  }

  private askHandle(raw: string): void {
    const handle = raw.trim().toLowerCase();
    this.settled.set(handle);
    this.checkRequest?.unsubscribe();
    if (!HANDLE_PATTERN.test(handle)) {
      this.checking.set(false);
      return;
    }
    this.checking.set(true);
    this.checkRequest = this.profileApi
      .getHandleAvailability({ handle }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (answer) => {
          this.answer.set(answer);
          this.checking.set(false);
        },
        // A failed check says nothing (offline, 429): the save still decides.
        error: () => this.checking.set(false),
      });
  }

  protected async saveProfile(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.profileSubmitted.set(true);
    if (this.form.invalid || this.check() === 'taken') {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    await this.run('profile', async () => {
      await this.profiles.save(profileRequest(this.form, this.games(), this.languages()));
      this.goTo('games');
    });
  }

  protected async saveInterests(): Promise<void> {
    if (!this.hasInterests()) {
      this.interestsInvalid.set(true);
      return;
    }
    this.interestsInvalid.set(false);
    await this.run('interests', async () => {
      await this.profiles.save(profileRequest(this.form, this.games(), this.languages()));
      await this.profiles.saveTags(this.tags(), this.customTags());
      this.goTo('place');
    });
  }

  protected async finish(saveLocation: boolean): Promise<void> {
    const draft = this.location();
    if (saveLocation && !isCompleteDraft(draft)) {
      this.locationSubmitted.set(true);
      return;
    }
    await this.run('location', async () => {
      if (saveLocation && isCompleteDraft(draft)) {
        await this.locations.saveLocation(draft);
        const privacy = this.locations.privacy();
        if (privacy && privacy.discoverable !== this.discoverable()) {
          await this.locations.savePrivacy({ ...privacy, discoverable: this.discoverable() });
        }
      }
      await this.session.load();
      // Home and Search open on the first picked game that can be browsed ("Opens first").
      const first = openingGame(this.games(), this.gameTiles());
      if (first) {
        this.gameContext.select(first);
      }
      this.toasts.show({ title: WELCOME_COPY.place.ready });
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    });
  }

  protected goBack(): void {
    const previous = previousWelcomeStep(this.step());
    if (previous) {
      this.goTo(previous);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }

  /** Shows `step`, its title taking the focus (a screen reader hears the new step). */
  private goTo(step: WelcomeStep): void {
    this.stepError.set(null);
    this.step.set(step);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('#welcome-title')?.focus(),
      { injector: this.injector },
    );
  }

  private focusFirstInvalid(): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }

  private async run(step: Exclude<Busy, null>, action: () => Promise<void>): Promise<void> {
    this.busy.set(step);
    this.stepError.set(null);
    try {
      await action();
    } catch (error) {
      const apiError = isApiError(error) ? error : null;
      const mapped =
        !!apiError && step === 'profile' && applyProfileServerErrors(this.form, apiError);
      if (mapped) {
        this.focusFirstInvalid();
      } else {
        this.stepError.set(
          apiError ? friendlyMessage(apiError) : 'Something went wrong. Please try again.',
        );
      }
    } finally {
      this.busy.set(null);
    }
  }
}
