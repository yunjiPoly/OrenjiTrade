import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { Router, RouterLink } from '@angular/router';
import { TagResponse } from '@orenji/api-client';
import { safeReturnUrl } from '../../core/auth/auth.guards';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, isApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import {
  AGE_CONFIRMATION_TYPE,
  AgeConfirmationCheckboxComponent,
} from '../../shared/legal/age-confirmation-checkbox.component';
import { LegalDocumentsStore } from '../auth/data/legal-documents.store';
import { LocationFieldsComponent } from '../../shared/location/location-fields/location-fields.component';
import {
  LocationDraft,
  MyLocationStore,
  draftOf,
  isCompleteDraft,
} from '../../shared/location/my-location.store';
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

type Busy = 'age' | 'profile' | 'interests' | 'location' | null;

/**
 * `/onboarding`: the steps after sign-up — the 18+ confirmation when the account has none yet
 * (existing accounts included; recorded with `POST /me/consents`), profile (handle, name, bio),
 * interests (games, languages, tags) and "Where are you?" (country, state/province, optional city
 * and discoverability; ADR 0017). Finishing goes to the map. An account that only misses the confirmation is done right after it.
 */
@Component({
  selector: 'app-onboarding-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatStepperModule,
    AgeConfirmationCheckboxComponent,
    ProfileFieldsComponent,
    GamePickerComponent,
    LanguagePickerComponent,
    TagPickerComponent,
    LocationFieldsComponent,
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
  protected readonly legal = inject(LegalDocumentsStore);
  protected readonly session = inject(SessionService);
  private readonly stepper = viewChild(MatStepper);

  readonly returnUrl = input<string | undefined>();

  protected readonly form = createProfileForm(this.fb);
  protected readonly games = signal<string[]>([]);
  protected readonly languages = signal<string[]>([]);
  protected readonly tags = signal<TagResponse[]>([]);
  protected readonly customTags = signal<string[]>([]);
  protected readonly location = signal<LocationDraft | null>(null);
  protected readonly locationSubmitted = signal(false);
  protected readonly discoverable = signal(false);
  /** Unticked by default; the API records the confirmation (`AGE_CONFIRMATION`). */
  protected readonly ageConfirmed = this.fb.control(false, {
    validators: Validators.requiredTrue,
  });

  protected readonly loading = signal(true);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly busy = signal<Busy>(null);
  protected readonly stepError = signal<string | null>(null);
  /** The age step is part of this visit (decided once, so step indexes never shift). */
  protected readonly ageStep = signal(false);
  protected readonly ageDone = signal(true);
  protected readonly ageSubmitted = signal(false);
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
    const [profile, locationOk] = await Promise.all([
      this.profiles.load(),
      this.locations.load(),
      this.legal.load(),
    ]);
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
    // Only an API that reports the flag as false asks for the confirmation.
    const ageConfirmed = onboarding?.ageConfirmed !== false;
    this.ageDone.set(ageConfirmed);
    this.ageStep.set(!ageConfirmed);
    this.profileDone.set(!!onboarding?.profileComplete);
    this.interestsDone.set(!!onboarding?.interestsSet);
    this.location.set(draftOf(this.locations.location()));
    this.discoverable.set(this.locations.privacy()?.discoverable ?? false);
    this.loading.set(false);
  }

  protected retryLegal(): void {
    void this.legal.load(true);
  }

  /**
   * Records the 18+ confirmation. Accounts that already finished the other steps (existing
   * collectors confirming on their next sign-in) are done right away.
   */
  protected async confirmAge(): Promise<void> {
    this.ageSubmitted.set(true);
    if (this.ageConfirmed.invalid) {
      this.ageConfirmed.markAsTouched();
      return;
    }
    await this.run('age', async () => {
      const document = this.legal.ageConfirmation();
      if (!document) {
        throw new Error('The age confirmation is not published by the API');
      }
      await this.session.acceptConsents([
        { documentType: AGE_CONFIRMATION_TYPE, version: document.version },
      ]);
      this.ageDone.set(true);
      if (this.profileDone() && this.interestsDone()) {
        this.snackBar.open('Thanks for confirming. Welcome back!', 'OK', { duration: 5000 });
        await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
        return;
      }
      this.advance();
    });
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
