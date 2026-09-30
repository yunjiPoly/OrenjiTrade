import { Injectable, computed, inject, signal } from '@angular/core';
import { LegalDocument, LegalService, RequiredConsent } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';

/** Current legal document versions (`GET /api/v1/public/legal/documents`), cached per session. */
@Injectable({ providedIn: 'root' })
export class LegalDocumentsStore {
  private readonly legalApi = inject(LegalService);

  private readonly documentsState = signal<LegalDocument[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);
  private loaded = false;

  readonly documents = this.documentsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** Documents a new collector must accept, in a stable reading order (terms first). */
  readonly requiredAtRegistration = computed(() =>
    sortDocuments(this.documentsState().filter((doc) => doc.requiredAtRegistration)),
  );

  async load(force = false): Promise<void> {
    if ((this.loaded && !force) || this.loadingState()) {
      return;
    }
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const docs = await firstValueFrom(
        this.legalApi.listLegalDocuments('body', false, { context: silentErrors() }),
      );
      this.documentsState.set(docs);
      this.loaded = true;
    } catch (error) {
      this.errorState.set(toApiError(error));
    } finally {
      this.loadingState.set(false);
    }
  }

  /** Title and in-app link of a required consent (falls back to the raw type). */
  describe(consent: RequiredConsent): { title: string; url: string } {
    const type: string = consent.documentType;
    const doc = this.documentsState().find((d) => d.documentType === type);
    return {
      title: doc?.title ?? consent.documentType.replace(/_/g, ' ').toLowerCase(),
      url: doc?.url ?? '/legal',
    };
  }
}

const ORDER = ['TERMS', 'PRIVACY', 'COMMUNITY_GUIDELINES', 'ACCEPTABLE_USE'];

function sortDocuments(docs: LegalDocument[]): LegalDocument[] {
  const rank = (type: string) => {
    const index = ORDER.indexOf(type);
    return index === -1 ? ORDER.length : index;
  };
  return [...docs].sort((a, b) => rank(a.documentType) - rank(b.documentType));
}
