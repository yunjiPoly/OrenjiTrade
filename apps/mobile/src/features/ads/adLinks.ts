import { absoluteApiUrl } from '@/src/api/client';

const CLICK_ROUTE = /^\/api\/v1\/ads\/[\w-]{1,64}\/click(\?[\w.=&%-]*)?$/;
const HTTPS_PAGE = /^https:\/\/[^\s/]+\/\S*$/;
const API_PATH = /^\/api\/v1\/[\w/.-]+$/;

/**
 * Link of a sponsored ad (web: `adClickHref`). The API serves `clickUrl` as its own click route
 * (`/api/v1/ads/{creativeId}/click?token=…`), which records the click once and redirects (302)
 * to the landing page; it is resolved against the API origin. Only that route (or an https URL)
 * is followed, so an ad can never open a `javascript:` or foreign relative link.
 */
export function adClickUrl(clickUrl: string | null | undefined): string | null {
  if (!clickUrl) {
    return null;
  }
  if (CLICK_ROUTE.test(clickUrl)) {
    return absoluteApiUrl(clickUrl);
  }
  return HTTPS_PAGE.test(clickUrl) ? clickUrl : null;
}

/** Image of a sponsored ad: https URLs or API-relative paths only (else no image). */
export function adImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }
  if (HTTPS_PAGE.test(imageUrl)) {
    return imageUrl;
  }
  return API_PATH.test(imageUrl) ? absoluteApiUrl(imageUrl) : null;
}
