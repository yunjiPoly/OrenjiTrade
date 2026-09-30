import { Pipe, PipeTransform, inject } from '@angular/core';
import { AppConfigService } from '../../core/config/app-config.service';

/**
 * Resolves a media URL sent by the API. Responses built during an HTTP request carry absolute
 * URLs, but payloads pushed over the realtime channel may carry the API-relative path
 * (`/api/v1/public/media/...`), which must point at the API origin rather than the web origin.
 * Absolute (`http:`, `https:`, `blob:`, `data:`) and protocol-relative URLs are kept.
 */
export function resolveMediaUrl(url: string | null | undefined, apiBaseUrl: string): string | null {
  if (!url) {
    return null;
  }
  if (!url.startsWith('/') || url.startsWith('//')) {
    return url;
  }
  const base = apiBaseUrl.trim().replace(/\/+$/, '');
  return base ? `${base}${url}` : url;
}

/** `{{ image.url | mediaUrl }}`: see {@link resolveMediaUrl}. */
@Pipe({ name: 'mediaUrl' })
export class MediaUrlPipe implements PipeTransform {
  private readonly config = inject(AppConfigService);

  transform(url: string | null | undefined): string | null {
    return resolveMediaUrl(url, this.config.apiBaseUrl());
  }
}
