import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { AccountService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../http/api-error';
import { silentErrors } from '../http/http-context';

/** File name of a data export, e.g. `orenjitrade-export-maika-2026-09-29.json`. */
export function exportFileName(handle: string | null | undefined, now = new Date()): string {
  const safeHandle = (handle ?? 'account').replace(/[^a-z0-9_-]/gi, '') || 'account';
  return `orenjitrade-export-${safeHandle}-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Downloads the collector's data export (`GET /api/v1/me/export`) as a JSON file. Allowed even
 * while an account deletion is pending. Rejects with an `ApiError` (e.g. 429 when rate limited).
 */
@Injectable({ providedIn: 'root' })
export class AccountExportService {
  private readonly accountApi = inject(AccountService);
  private readonly doc = inject(DOCUMENT);

  async download(handle: string | null | undefined): Promise<string> {
    let data: unknown;
    try {
      data = await firstValueFrom(
        this.accountApi.exportMyData('body', false, { context: silentErrors() }),
      );
    } catch (error) {
      throw toApiError(error);
    }
    const fileName = exportFileName(handle);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = this.doc.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    this.doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  }
}
