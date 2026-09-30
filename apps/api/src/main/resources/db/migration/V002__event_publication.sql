-- V002: Spring Modulith event publication registry (transactional outbox, ADR 0009).
--
-- Copied verbatim from spring-modulith-events-jdbc 2.1.1
-- (org/springframework/modulith/events/jdbc/schemas/v2/schema-postgresql.sql), the current
-- structure used when `spring.modulith.events.jdbc.use-legacy-structure` is not set.
-- `spring.modulith.events.jdbc.schema-initialization.enabled` stays false: Flyway owns this table.
-- The optional `event_publication_archive` table (completion-mode=archive) is not created; the
-- application uses completion-mode=update.

CREATE TABLE IF NOT EXISTS event_publication
(
  id                     UUID NOT NULL,
  listener_id            TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  serialized_event       TEXT NOT NULL,
  publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_date        TIMESTAMP WITH TIME ZONE,
  status                 TEXT,
  completion_attempts    INT,
  last_resubmission_date TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS event_publication_serialized_event_hash_idx ON event_publication USING hash(serialized_event);
CREATE INDEX IF NOT EXISTS event_publication_by_completion_date_idx ON event_publication (completion_date);
