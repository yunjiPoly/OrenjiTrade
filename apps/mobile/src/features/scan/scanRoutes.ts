/**
 * Where the scan's screens live (owner spec 2026-10-15, section 4): the camera (27), the review
 * (30) and the search inside the scan. The review opened by Add cards' "Choose from photos" has no
 * camera under it: it says so with `from=photos`.
 */
export const SCAN_CAMERA_ROUTE = '/scan';
export const SCAN_REVIEW_ROUTE = '/scan/review';
export const SCAN_SEARCH_ROUTE = '/scan/search';

/** The review's `from` when Add cards opened it after the photo picker. */
export const REVIEW_FROM_PHOTOS = 'photos';
