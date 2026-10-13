-- V111: database comments that still described the coordinate model (ADR 0017). Metadata only:
-- applied migrations are never edited, so the stale comment of V060 is replaced here.

COMMENT ON TABLE rating_summary IS 'Maintained by the ratings module on every rating write, hide and unhide (OK ratings only); feeds profiles, collector search results and offers. No location, no distance.';
