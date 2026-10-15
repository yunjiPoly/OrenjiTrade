-- V124: the flag of the camera card scan (owner spec 2026-10-15, docs/product/specs/2026-10-15-card-scan.md).
-- The phone reads a Yu-Gi-Oh! card's name and set code on the device; POST /api/v1/cards/scan-match
-- finds the printing and POST /api/v1/inventory/items/batch adds the scanned cards. Both answer
-- 404 FEATURE_DISABLED while the flag is off, and the phone hides the scan rows.
--
-- On by default (the owner's choice, spec section 10). Editable in /admin > Feature flags like the
-- others (SUPER_ADMIN, audited). mlScanning (the on-hold Phase 11 photo pipeline) stays off and is
-- not touched: the owner lifted the ML hold for this on-device text scan only.
INSERT INTO feature_flag (key, enabled, description) VALUES
    ('cardTextScan', true, 'Scan with camera: the phone reads a Yu-Gi-Oh! card''s name and set code on the device, the API finds the printing (no photo upload).')
ON CONFLICT (key) DO NOTHING;
