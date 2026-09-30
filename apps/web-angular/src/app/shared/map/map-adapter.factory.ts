import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { AppConfigService } from '../../core/config/app-config.service';
import { MapAdapter, MapAdapterLoader, MapAdapterOptions } from './map-adapter';

/** Lazy Leaflet/OpenStreetMap loader (default provider; replaced by fakes in unit tests). */
export const LEAFLET_MAP_LOADER = new InjectionToken<MapAdapterLoader>('LEAFLET_MAP_LOADER', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return (container, options) =>
      import('./leaflet-map-adapter').then((m) =>
        m.createLeafletMapAdapter(container, options, doc),
      );
  },
});

/** Lazy Google Maps loader; only used when `googleMapsApiKey` is configured. */
export const GOOGLE_MAP_LOADER = new InjectionToken<
  (
    container: HTMLElement,
    options: MapAdapterOptions & { apiKey: string; mapId: string },
  ) => Promise<MapAdapter>
>('GOOGLE_MAP_LOADER', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return (container, options) =>
      import('./google-maps-adapter').then((m) =>
        m.createGoogleMapsAdapter(container, options, doc),
      );
  },
});

/**
 * Picks the map provider (ADR 0010): Google Maps when a browser key is configured, Leaflet with
 * OpenStreetMap tiles otherwise (local development, CI, E2E). A Google failure falls back to
 * Leaflet so a bad key never breaks a page.
 */
@Injectable({ providedIn: 'root' })
export class MapAdapterFactory {
  private readonly config = inject(AppConfigService);
  private readonly leaflet = inject(LEAFLET_MAP_LOADER);
  private readonly google = inject(GOOGLE_MAP_LOADER);

  async create(container: HTMLElement, options: MapAdapterOptions): Promise<MapAdapter> {
    const config = await this.config.whenLoaded();
    if (config.googleMapsApiKey) {
      try {
        return await this.google(container, {
          ...options,
          apiKey: config.googleMapsApiKey,
          mapId: config.googleMapsMapId,
        });
      } catch (error) {
        console.warn('[OrenjiTrade] Google Maps unavailable; using OpenStreetMap.', error);
        container.replaceChildren();
      }
    }
    return this.leaflet(container, options);
  }
}
