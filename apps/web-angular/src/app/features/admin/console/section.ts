import { WritableSignal, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';

/** One card's data with its own loading and error (each card retries alone; spec 15.2). */
export interface Section<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

/** A section that has not answered yet. */
export function section<T>(): WritableSignal<Section<T>> {
  return signal<Section<T>>({ data: null, error: null, loading: true });
}

/** Runs one request into its section; the previous data stays shown while it reloads. */
export async function loadInto<T>(
  target: WritableSignal<Section<T>>,
  request: Observable<T> | (() => Promise<T>),
): Promise<T | null> {
  target.update((current) => ({ ...current, loading: true, error: null }));
  try {
    const data = typeof request === 'function' ? await request() : await firstValueFrom(request);
    target.set({ data, error: null, loading: false });
    return data;
  } catch (error) {
    target.update((current) => ({ ...current, error: toApiError(error), loading: false }));
    return null;
  }
}
