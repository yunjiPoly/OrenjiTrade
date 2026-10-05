import { fetchAccountExport } from '@/src/api/hooks/account';

import { exportFileName } from './exportFileName';

export { exportFileName };

/**
 * Web build: downloads `GET /api/v1/me/export` as a JSON file (same behaviour as the web app's
 * `AccountExportService`). Resolves with the file name; rejects with an `ApiError`.
 */
export async function exportMyData(handle: string | null | undefined): Promise<string> {
  const data = await fetchAccountExport();
  const name = exportFileName(handle);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
