package com.orenjitrade.api.auth.infra;

import com.orenjitrade.api.auth.domain.IdentityAdminClient;
import com.orenjitrade.api.auth.domain.IdentityUserCreation;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Test-profile stand-in for the Firebase admin client: remembers what it was asked to do, and in
 * which order per user ({@link #callsFor}: {@code disable}, {@code enable}, {@code revoke}, {@code
 * delete}).
 */
@Component
@Profile("test")
public class NoopIdentityAdminClient implements IdentityAdminClient {

    private static final Logger log = LoggerFactory.getLogger(NoopIdentityAdminClient.class);

    private final Set<String> disabled = ConcurrentHashMap.newKeySet();
    private final Set<String> deleted = ConcurrentHashMap.newKeySet();
    private final Set<String> revoked = ConcurrentHashMap.newKeySet();
    private final Set<String> created = ConcurrentHashMap.newKeySet();
    private final Map<String, List<String>> calls = new ConcurrentHashMap<>();

    private void record(String providerUid, String call) {
        calls.computeIfAbsent(providerUid, uid -> new CopyOnWriteArrayList<>()).add(call);
    }

    @Override
    public void disableUser(String providerUid) {
        log.debug("noop disableUser {}", providerUid);
        disabled.add(providerUid);
        record(providerUid, "disable");
    }

    @Override
    public void enableUser(String providerUid) {
        log.debug("noop enableUser {}", providerUid);
        disabled.remove(providerUid);
        record(providerUid, "enable");
    }

    @Override
    public void revokeSessions(String providerUid) {
        log.debug("noop revokeSessions {}", providerUid);
        revoked.add(providerUid);
        record(providerUid, "revoke");
    }

    @Override
    public void deleteUser(String providerUid) {
        log.debug("noop deleteUser {}", providerUid);
        deleted.add(providerUid);
        record(providerUid, "delete");
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

    /**
     * What the user {@code providerUid} was asked, oldest first ({@code disable}, {@code enable}…).
     */
    public List<String> callsFor(String providerUid) {
        return List.copyOf(calls.getOrDefault(providerUid, List.of()));
    }

    public Set<String> createdUids() {
        return Set.copyOf(created);
    }
}
