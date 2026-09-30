-- V063: local analytics aggregate (Phase 7 contract, admin "Analytics": GET /admin/analytics/summary
-- reads BigQuery in the cloud, this local aggregate otherwise).
--
-- One counter per UTC day and event type, incremented by the analytics publisher for every event it
-- hands to the transport. Only event type names and counts: no actor hashes, payloads, ids or
-- geography.

CREATE TABLE analytics_daily_count (
    day        date        NOT NULL,
    event_type text        NOT NULL,
    count      bigint      NOT NULL DEFAULT 0 CHECK (count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_analytics_daily_count PRIMARY KEY (day, event_type),
    CONSTRAINT ck_analytics_daily_count_type CHECK (event_type ~ '^[a-z][a-z0-9_.]{1,63}$')
);

COMMENT ON TABLE analytics_daily_count IS 'Local aggregate of analytics events per UTC day and type (counts only, no PII); feeds GET /admin/analytics/summary.';
