import { UrlMatcher, UrlSegment } from '@angular/router';

/**
 * Matches `/<path>` and `/<path>/:<param>` with ONE route, so moving between them (a list and
 * the drawer of one of its items, e.g. `/wishlist` ↔ `/wishlist/<id>`) keeps the page component
 * instead of re-creating it. The parameter reaches the component as an input
 * (`withComponentInputBinding`), `undefined` on the bare path.
 */
export function optionalParamMatcher(path: string, param: string): UrlMatcher {
  return (segments: UrlSegment[]) => {
    if (segments.length === 0 || segments.length > 2 || segments[0].path !== path) {
      return null;
    }
    return {
      consumed: segments,
      posParams: segments.length === 2 ? { [param]: segments[1] } : {},
    };
  };
}
