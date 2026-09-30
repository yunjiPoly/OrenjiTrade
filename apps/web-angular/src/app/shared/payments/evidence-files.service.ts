import { DestroyRef, Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { DisputeEvidence, DisputesService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { silentErrors } from '../../core/http/http-context';

export type EvidencePreview =
  { state: 'loading' } | { state: 'ready'; url: string } | { state: 'error' };

/**
 * Evidence files of a dispute, fetched through the authenticated route
 * (`GET /disputes/{id}/evidence/{evidenceId}/file`, `private, no-store`; never a public URL) and
 * shown from `blob:` object URLs that are revoked when the page goes away. Provided by the
 * pages that list evidence.
 */
@Injectable()
export class EvidenceFilesService {
  private readonly api = inject(DisputesService);
  private readonly previews = new Map<string, WritableSignal<EvidencePreview>>();
  private readonly urls = new Set<string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.urls) {
        URL.revokeObjectURL(url);
      }
      this.urls.clear();
    });
  }

  /** A preview of IMAGE evidence (loaded once per evidence id). */
  preview(disputeId: string, evidence: DisputeEvidence): Signal<EvidencePreview> {
    let preview = this.previews.get(evidence.id);
    if (!preview) {
      preview = signal<EvidencePreview>({ state: 'loading' });
      this.previews.set(evidence.id, preview);
      const target = preview;
      void this.fetch(disputeId, evidence).then(
        (url) => target.set({ state: 'ready', url }),
        () => target.set({ state: 'error' }),
      );
    }
    return preview.asReadonly();
  }

  /** Downloads DOCUMENT evidence (PDF) under a neutral file name. */
  async download(disputeId: string, evidence: DisputeEvidence): Promise<boolean> {
    try {
      const url = await this.fetch(disputeId, evidence);
      const link = document.createElement('a');
      link.href = url;
      link.download = `evidence-${evidence.id}.pdf`;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    } catch {
      return false;
    }
  }

  private async fetch(disputeId: string, evidence: DisputeEvidence): Promise<string> {
    const blob = await firstValueFrom(
      this.api.getDisputeEvidenceFile({ id: disputeId, evidenceId: evidence.id }, 'body', false, {
        httpHeaderAccept: evidence.kind === 'DOCUMENT' ? 'application/pdf' : 'image/jpeg',
        context: silentErrors(),
      }),
    );
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }
}
