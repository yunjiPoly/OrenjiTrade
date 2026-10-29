import { Injectable } from '@angular/core';

export type ImportSourceChoice = 'YDK' | 'COLLECTR_CSV';

/** The source a file name suggests (a hint for the toggle; the server decides from the content). */
export function sourceOfFile(name: string): ImportSourceChoice | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ydk')) {
    return 'YDK';
  }
  if (lower.endsWith('.csv')) {
    return 'COLLECTR_CSV';
  }
  return null;
}

/**
 * A `.ydk` or `.csv` dropped anywhere on Inventory (spec 9.7) is handed to Import, which opens with
 * it. Kept in memory only, for the next Import page.
 */
@Injectable({ providedIn: 'root' })
export class ImportHandoff {
  private file: File | null = null;

  give(file: File): void {
    this.file = file;
  }

  take(): File | null {
    const file = this.file;
    this.file = null;
    return file;
  }
}
