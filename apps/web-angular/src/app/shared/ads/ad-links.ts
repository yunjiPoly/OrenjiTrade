import { resolveMediaUrl } from '../pipes/media-url.pipe';

/**
 * Link of a sponsored ad. The API serves `clickUrl` as its own click route
 * (`/api/v1/ads/{creativeId}/click?token=…`), which records the click once and redirects (302) to
 * the landing page; relative routes are resolved against the API origin. Only that route (or an
 * https URL) is followed, so an ad can never inject a `javascript:` or foreign relative link.
 */
export function adClickHref(
  clickUrl: string | null | undefined,
  apiBaseUrl: string,
): string | null {
  if (!clickUrl) {
    return null;
  }
  if (/^\/api\/v1\/ads\/[\w-]{1,64}\/click(\?[\w.=&%-]*)?$/.test(clickUrl)) {
    return resolveMediaUrl(clickUrl, apiBaseUrl);
  }
  return /^https:\/\/[^\s/]+\/\S*$/.test(clickUrl) ? clickUrl : null;
}

/** Image of a sponsored ad: https URLs or API-relative paths only (else no image). */
export function adImageSrc(imageUrl: string | null | undefined, apiBaseUrl: string): string | null {
  if (!imageUrl) {
    return null;
  }
  if (/^https:\/\/[^\s/]+\/\S*$/.test(imageUrl)) {
    return imageUrl;
  }
  return /^\/api\/v1\/[\w/.-]+$/.test(imageUrl) ? resolveMediaUrl(imageUrl, apiBaseUrl) : null;
}
