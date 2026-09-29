import { Injectable, inject, signal } from '@angular/core';
import {
  MyProfileResponse,
  ProfileService,
  TagResponse,
  UpdateProfileRequest,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';

async function call<T>(request: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(request);
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * The signed-in collector's own profile (`/me/profile`, tags, avatar) shared by onboarding and
 * settings. Writes refresh the session so onboarding flags, name and avatar update everywhere.
 * Every method rejects with an {@link ApiError}.
 */
@Injectable({ providedIn: 'root' })
export class MyProfileStore {
  private readonly profileApi = inject(ProfileService);
  private readonly session = inject(SessionService);

  private readonly profileState = signal<MyProfileResponse | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);

  readonly profile = this.profileState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Loads the profile; resolves null (and sets `error`) on failure. */
  async load(): Promise<MyProfileResponse | null> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const profile = await call(
        this.profileApi.getMyProfile('body', false, { context: silentErrors() }),
      );
      this.profileState.set(profile);
      return profile;
    } catch (error) {
      this.errorState.set(error as ApiError);
      return null;
    } finally {
      this.loadingState.set(false);
    }
  }

  async save(request: UpdateProfileRequest): Promise<MyProfileResponse> {
    const profile = await call(
      this.profileApi.updateMyProfile({ updateProfileRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
    );
    this.profileState.set(profile);
    void this.session.load();
    return profile;
  }

  async saveTags(
    tags: readonly TagResponse[],
    customLabels: readonly string[],
  ): Promise<TagResponse[]> {
    const saved = await call(
      this.profileApi.updateMyProfileTags(
        {
          updateProfileTagsRequest: {
            tagIds: tags.map((tag) => tag.id),
            customLabels: [...customLabels],
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
    this.profileState.update((profile) => (profile ? { ...profile, tags: saved } : profile));
    void this.session.load();
    return saved;
  }

  async uploadAvatar(file: File): Promise<string> {
    const response = await call(
      this.profileApi.uploadMyAvatar({ file }, 'body', false, { context: silentErrors() }),
    );
    this.profileState.update((profile) =>
      profile ? { ...profile, avatarUrl: response.avatarUrl } : profile,
    );
    void this.session.load();
    return response.avatarUrl;
  }

  async deleteAvatar(): Promise<void> {
    await call(this.profileApi.deleteMyAvatar('body', false, { context: silentErrors() }));
    this.profileState.update((profile) => (profile ? { ...profile, avatarUrl: null } : profile));
    void this.session.load();
  }
}

/** Splits saved tags into curated tags and custom labels (the API returns both as tags). */
export function splitTags(tags: readonly TagResponse[]): {
  curated: TagResponse[];
  custom: string[];
} {
  return {
    curated: tags.filter((tag) => tag.category !== 'CUSTOM'),
    custom: tags.filter((tag) => tag.category === 'CUSTOM').map((tag) => tag.label),
  };
}
