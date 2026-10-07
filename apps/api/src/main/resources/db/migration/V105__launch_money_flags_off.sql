-- V105: launch configuration (2026-10-05). OrenjiTrade launches as "discovery + messaging only":
-- every money feature stays switched off until a SUPER_ADMIN turns it on in /admin > Feature flags
-- (docs/deployment/runbooks.md, "Launch configuration").
--
-- V010 created premiumPlans and credits ENABLED (the Phase 10 defaults). A production database
-- migrated from scratch would therefore market Premium with a live checkout and expose the credits
-- ledger at first boot, before any admin could switch them off. Applied migrations are never edited
-- (CLAUDE.md), so this migration changes the two rows as data. Rows an admin already changed
-- (updated_by set) are left alone, exactly like the local seed does. The local/dev seed
-- (FeatureFlagSeedContributor) switches both back on so every flow keeps running locally on the
-- fake providers; staging/prod do not run the seed and start with every money feature off.
UPDATE feature_flag
   SET enabled = false,
       updated_at = now()
 WHERE key IN ('premiumPlans', 'credits')
   AND updated_by IS NULL;
