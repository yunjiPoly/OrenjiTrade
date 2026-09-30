package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.auth.domain.IdentityAdminClient;
import com.orenjitrade.api.auth.domain.IdentityAdminException;
import com.orenjitrade.api.auth.domain.IdentityUserCreation;
import com.orenjitrade.api.auth.infra.FirebaseProperties;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.common.seed.SeedProperties;
import com.orenjitrade.api.users.infra.SeedAccounts.SeedAccount;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Creates the seed accounts in the Firebase Auth emulator (uid {@code seed-<handle>}, verified
 * email, the development password from {@code orenji.seed.emulator-password}) so developers can
 * sign in on web and mobile. Only when {@code FIREBASE_AUTH_EMULATOR_HOST} is set; existing users
 * are left untouched and an unreachable emulator only logs a warning.
 */
@Component
public class EmulatorUserSeedContributor implements SeedContributor {

    private static final Logger log = LoggerFactory.getLogger(EmulatorUserSeedContributor.class);

    private final SeedAccounts seedAccounts;
    private final IdentityAdminClient identityAdminClient;
    private final FirebaseProperties firebaseProperties;
    private final SeedProperties seedProperties;

    public EmulatorUserSeedContributor(
            SeedAccounts seedAccounts,
            IdentityAdminClient identityAdminClient,
            FirebaseProperties firebaseProperties,
            SeedProperties seedProperties) {
        this.seedAccounts = seedAccounts;
        this.identityAdminClient = identityAdminClient;
        this.firebaseProperties = firebaseProperties;
        this.seedProperties = seedProperties;
    }

    @Override
    public String name() {
        return "auth emulator users";
    }

    @Override
    public int order() {
        return ORDER_IDENTITIES;
    }

    @Override
    public void seed() {
        if (!firebaseProperties.emulatorEnabled()) {
            log.info("FIREBASE_AUTH_EMULATOR_HOST not set; skipping emulator user seed");
            return;
        }
        int created = 0;
        for (SeedAccount account : seedAccounts.all()) {
            try {
                boolean wasCreated =
                        identityAdminClient.createUser(
                                new IdentityUserCreation(
                                        account.providerUid(),
                                        account.email(),
                                        seedProperties.emulatorPassword(),
                                        account.displayName(),
                                        true));
                if (wasCreated) {
                    created++;
                }
            } catch (IdentityAdminException e) {
                log.warn(
                        "Could not seed emulator user {} at {}: {}",
                        account.providerUid(),
                        firebaseProperties.authEmulatorHost(),
                        e.getMessage());
                return;
            }
        }
        log.info(
                "Auth emulator seed: {} created, {} already present",
                created,
                seedAccounts.all().size() - created);
    }
}
