package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.users.domain.LegalDocument;
import com.orenjitrade.api.users.infra.SeedAccounts.SeedAccount;
import java.sql.Timestamp;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds the 12 accounts, their roles and their consents to every required legal document. Upserts
 * keyed by the stable ids: re-running refreshes names/emails/plans and adds missing roles and
 * consents, but never resets a status or revokes a role that a developer changed by hand.
 */
@Component
public class UserAccountSeedContributor implements SeedContributor {

    private final SeedAccounts seedAccounts;
    private final LegalDocumentRepository legalDocuments;
    private final JdbcClient jdbc;
    private final TimeProvider timeProvider;

    public UserAccountSeedContributor(
            SeedAccounts seedAccounts,
            LegalDocumentRepository legalDocuments,
            JdbcClient jdbc,
            TimeProvider timeProvider) {
        this.seedAccounts = seedAccounts;
        this.legalDocuments = legalDocuments;
        this.jdbc = jdbc;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "user accounts";
    }

    @Override
    public int order() {
        return ORDER_ACCOUNTS;
    }

    @Override
    @Transactional
    public void seed() {
        Timestamp now = Timestamp.from(timeProvider.now());
        List<LegalDocument> required =
                legalDocuments.findByCurrentTrueOrderByDocumentTypeAsc().stream()
                        .filter(LegalDocument::isRequiredAtRegistration)
                        .toList();
        for (SeedAccount account : seedAccounts.all()) {
            jdbc.sql(
                            """
                            INSERT INTO user_account (id, provider_uid, email, email_verified, handle,
                                display_name, status, plan_code, created_at, updated_at, last_active_at)
                            VALUES (:id, :providerUid, :email, true, :handle, :displayName, 'ACTIVE',
                                :planCode, :now, :now, :now)
                            ON CONFLICT (id) DO UPDATE SET
                                email = EXCLUDED.email,
                                display_name = EXCLUDED.display_name,
                                plan_code = EXCLUDED.plan_code,
                                updated_at = EXCLUDED.updated_at
                            """)
                    .param("id", account.id())
                    .param("providerUid", account.providerUid())
                    .param("email", account.email())
                    .param("handle", account.handle())
                    .param("displayName", account.displayName())
                    .param("planCode", account.planCode())
                    .param("now", now)
                    .update();
            for (Role role : account.roles()) {
                jdbc.sql(
                                """
                                INSERT INTO user_role (user_id, role, granted_at, granted_by)
                                VALUES (:id, :role, :now, NULL)
                                ON CONFLICT (user_id, role) DO NOTHING
                                """)
                        .param("id", account.id())
                        .param("role", role.name())
                        .param("now", now)
                        .update();
            }
            for (LegalDocument document : required) {
                jdbc.sql(
                                """
                                INSERT INTO user_consent (id, user_id, document_type, version,
                                    accepted_at, ip_hash, user_agent)
                                VALUES (gen_random_uuid(), :id, :documentType, :version, :now, NULL,
                                    'seed')
                                ON CONFLICT (user_id, document_type, version) DO NOTHING
                                """)
                        .param("id", account.id())
                        .param("documentType", document.getDocumentType().name())
                        .param("version", document.getVersion())
                        .param("now", now)
                        .update();
            }
        }
    }
}
