package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.auth.domain.Role;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * The 12 fictional seed accounts of {@code docs/development/seed-data.md}, loaded from {@code
 * db/seed/users.json}. Stable ids follow {@code 00000000-0000-4000-8000-0000000000NN}; provider
 * uids are {@code seed-<handle>} unless the entry overrides them.
 */
@Component
public class SeedAccounts {

    public static final String RESOURCE = "db/seed/users.json";
    public static final String ID_PREFIX = "00000000-0000-4000-8000-0000000000";
    public static final String PROVIDER_UID_PREFIX = "seed-";

    private final List<SeedAccount> accounts;

    public SeedAccounts(JsonMapper jsonMapper) {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            List<SeedAccountEntry> entries =
                    jsonMapper.readValue(in, new TypeReference<List<SeedAccountEntry>>() {});
            this.accounts = entries.stream().map(SeedAccountEntry::toAccount).toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + RESOURCE, e);
        }
    }

    public List<SeedAccount> all() {
        return accounts;
    }

    /** One seed account. */
    public record SeedAccount(
            UUID id,
            String providerUid,
            String handle,
            String email,
            String displayName,
            Set<Role> roles,
            String planCode) {}

    /** JSON shape of {@value #RESOURCE}. */
    record SeedAccountEntry(
            String nn,
            String handle,
            @Nullable String providerUid,
            String email,
            String displayName,
            List<String> roles,
            @Nullable String planCode) {

        SeedAccount toAccount() {
            Set<Role> roleSet =
                    roles.stream().map(Role::valueOf).collect(java.util.stream.Collectors.toSet());
            roleSet.add(Role.USER);
            return new SeedAccount(
                    UUID.fromString(ID_PREFIX + nn),
                    providerUid != null ? providerUid : PROVIDER_UID_PREFIX + handle,
                    handle,
                    email,
                    displayName,
                    Set.copyOf(roleSet),
                    planCode != null ? planCode : "FREE");
        }
    }
}
