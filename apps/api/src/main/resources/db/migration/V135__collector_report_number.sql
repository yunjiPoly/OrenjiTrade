-- V135 (web stage WH1, the admin console's moderation; spec 15.8.1 "Report numbers"): a short
-- number per collector report, shown to staff as "#1047" and searchable from the console's staff
-- search and the Reports page. Additive: a new column with a default, nothing renamed or retyped.
--
-- Numbers start at 1001 so they read alike in a list. Existing reports are numbered by the date
-- they were filed (then their id, for two filed in the same instant); new reports take the next
-- number from the sequence. A number is never reused: a deleted account's reports go with it
-- (ON DELETE CASCADE), and their numbers stay unused.
--
-- PRIVACY: a number names a report to staff only; it carries no place (ADR 0017).

CREATE SEQUENCE collector_report_number_seq AS bigint MINVALUE 1001 START WITH 1001;

ALTER TABLE collector_report ADD COLUMN report_number bigint;

WITH ordered AS (
    SELECT id, 1000 + row_number() OVER (ORDER BY created_at, id) AS n
      FROM collector_report
)
UPDATE collector_report AS report
   SET report_number = ordered.n
  FROM ordered
 WHERE report.id = ordered.id;

-- The next number follows the last one given above (1001 on an empty table).
SELECT CASE
           WHEN max(report_number) IS NULL THEN setval('collector_report_number_seq', 1001, false)
           ELSE setval('collector_report_number_seq', max(report_number), true)
       END
  FROM collector_report;

ALTER TABLE collector_report
    ALTER COLUMN report_number SET DEFAULT nextval('collector_report_number_seq'),
    ALTER COLUMN report_number SET NOT NULL;

ALTER SEQUENCE collector_report_number_seq OWNED BY collector_report.report_number;

CREATE UNIQUE INDEX ux_collector_report_number ON collector_report (report_number);

COMMENT ON COLUMN collector_report.report_number IS 'Short staff-facing number of the report ("#1047", V135), from collector_report_number_seq; existing reports numbered by filing date. Never shown to members.';
