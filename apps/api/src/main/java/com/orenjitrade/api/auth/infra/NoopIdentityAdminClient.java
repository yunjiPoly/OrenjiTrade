package com.orenjitrade.api.auth.infra;

import com.orenjitrade.api.auth.domain.IdentityAdminClient;
import com.orenjitrade.api.auth.domain.IdentityUserCreation;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Test-profile stand-in for the Firebase admin client: remembers what it was asked to do. */
@Component
@Profile("test")
public class NoopIdentityAdminClient implements IdentityAdminClient {

    private static final Logger log = LoggerFactory.getLogger(NoopIdentityAdminClient.class);

    private final Set<String> disabled = ConcurrentHashMap.newKeySet();
    private final Set<String> deleted = ConcurrentHashMap.newKeySet();
    private final Set<String> revoked = ConcurrentHashMap.newKeySet();
    private final Set<String> created = ConcurrentHashMap.newKeySet();

    @Override
    public void disableUser(String providerUid) {
        log.debug("noop disableUser {}", providerUid);
        disabled.add(providerUid);
    }

    @Override
    public void enableUser(String providerUid) {
        log.debug("noop enableUser {}", providerUid);
        disabled.remove(providerUid);
    }

    @Override
    public void revokeSessions(String providerUid) {
        log.debug("noop revokeSessions {}", providerUid);
        revoked.add(providerUid);
    }

    @Override
    public void deleteUser(String providerUid) {
        log.debug("noop deleteUser {}", providerUid);
        deleted.add(providerUid);
    }

    @Override
    public boolean createUser(IdentityUserCreation user) {
        log.debug("noop createUser {}", user);
        return created.add(user.providerUid());
    }

    public boolean isDisabled(String providerUid) {
        return disabled.contains(providerUid);
    }

    public boolean hasRevokedSessions(String providerUid) {
        return revoked.contains(providerUid);
    }

    public boolean isDeleted(String providerUid) {
        return deleted.contains(providerUid);
    }

    public Set<String> createdUids() {
        return Set.copyOf(created);
    }
}
