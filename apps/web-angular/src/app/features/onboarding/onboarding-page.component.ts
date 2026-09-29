import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { Router } from '@angular/router';
import { TagResponse } from '@orenji/api-client';
import { safeReturnUrl } from '../../core/auth/auth.guards';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, isApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { DEFAULT_RADIUS_KM, DEFAULT_TRADING_CENTER } from '../../shared/location/city-presets';
import { MyLocationStore } from '../../shared/location/my-location.store';
import {
  TradingAreaPickerComponent,
  TradingAreaSource,
  TradingAreaValue,
} from '../../shared/location/trading-area-picker/trading-area-picker.component';
import { GamePickerComponent } from '../../shared/profile/game-picker/game-picker.component';
import { LanguagePickerComponent } from '../../shared/profile/language-picker/language-picker.component';
import { MyProfileStore, splitTags } from '../../shared/profile/my-profile.store';
import { ProfileFieldsComponent } from '../../shared/profile/profile-fields/profile-fields.component';
import {
  applyProfileServerErrors,
  createProfileForm,
  patchProfileForm,
  profileRequest,
} from '../../shared/profile/profile-form';
import { TagPickerComponent } from '../../shared/profile/tag-picker/tag-picker.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';

type Busy = 'profile' | 'interests' | 'area' | null;

/**
 * `/onboarding`: three steps after sign-up — profile (handle, name, bio), interests (games,
 * languages, tags) and trading area (map picker + discoverability). Finishing goes to the map.
 */
@Component({
  selector: 'app-onboarding-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatStepperModule,
    ProfileFieldsComponent,
    GamePickerComponent,
    LanguagePickerComponent,
    TagPickerComponent,
    TradingAreaPickerComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './onboarding-page.component.html',
  styleUrl: './onboarding-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly profiles = inject(MyProfileStore);
  private readonly locations = inject(MyLocationStore);
  protected readonly session = inject(SessionService);
  private readonly stepper = viewChild(MatStepper);

  readonly returnUrl = input<string | undefined>();

  protected readonly form = createProfileForm(this.fb);
  protected readonly games = signal<string[]>([]);
  protected readonly languages = signal<string[]>([]);
  protected readonly tags = signal<TagResponse[]>([]);
  protected readonly customTags = signal<string[]>([]);
  protected readonly area = signal<TradingAreaValue>({
    ...DEFAULT_TRADING_CENTER,
    radiusKm: DEFAULT_RADIUS_KM,
    source: 'MANUAL',
  });
  protected readonly discoverable = signal(false);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly busy = signal<Busy>(null);
  protected readonly stepError = signal<string | null>(null);
  protected readonly profileDone = signal(false);
  protected readonly interestsDone = signal(false);
  protected readonly interestsInvalid = signal(false);
  protected readonly hasInterests = computed(
    () => this.games().length > 0 || this.tags().length > 0 || this.customTags().length > 0,
  );

  constructor() {
    void this.load();
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
    this.games.set(profile.games);
    this.languages.set(profile.languages);
    const { curated, custom } = splitTags(profile.tags);
    this.tags.set(curated);
    this.customTags.set(custom);
    const onboarding = this.session.me()?.onboarding;
    this.profileDone.set(!!onboarding?.profileComplete);
    this.interestsDone.set(!!onboarding?.interestsSet);
    const saved = this.locations.location()?.tradingArea;
    if (saved) {
      this.area.set({
        lat: saved.lat,
        lng: saved.lng,
        radiusKm: saved.radiusKm,
        source: saved.source as TradingAreaSource,
      });
    }
    this.discoverable.set(this.locations.privacy()?.discoverable ?? false);
    this.loading.set(false);
  }

  protected async saveProfile(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.run('profile', async () => {
      await this.profiles.save(profileRequest(this.form, this.games(), this.languages()));
      this.profileDone.set(true);
      this.advance();
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
      this.interestsDone.set(true);
      this.advance();
    });
  }

  protected async finish(saveArea: boolean): Promise<void> {
    await this.run('area', async () => {
      if (saveArea) {
        await this.locations.saveTradingArea(this.area());
        const privacy = this.locations.privacy();
        if (privacy && privacy.discoverable !== this.discoverable()) {
          await this.locations.savePrivacy({ ...privacy, discoverable: this.discoverable() });
        }
      }
      await this.session.load();
      this.snackBar.open('Welcome to OrenjiTrade! Your profile is ready.', 'OK', {
        duration: 5000,
      });
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    });
  }

  private advance(): void {
    // The `[completed]` binding only updates on the next change detection; a linear stepper
    // checks it synchronously, so mark the current step before moving on.
    const stepper = this.stepper();
    if (stepper?.selected) {
      stepper.selected.completed = true;
      stepper.next();
    }
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
      if (!mapped) {
        this.stepError.set(
          apiError ? friendlyMessage(apiError) : 'Something went wrong. Please try again.',
        );
      }
    } finally {
      this.busy.set(null);
    }
  }
}
